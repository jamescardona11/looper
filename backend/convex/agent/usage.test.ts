import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// import.meta.glob is provided by Vite/Vitest at test time; tsc doesn't type it.
// This test lives under convex/agent/, so glob keys are relative to THIS dir:
//   "./usage.ts"  → convex/agent/usage.ts  (key must be "agent/usage")
//   "../admin.ts" → convex/admin.ts        (key must be "admin")
// convex-test expects keys relative to convex/, so re-root them accordingly.
const rawModules = (
  import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }
).glob("../**/*.ts");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => {
    const rerooted = path.startsWith("../") ? `./${path.slice(3)}` : `./agent/${path.slice(2)}`;
    return [rerooted, loader];
  }),
);

// userUsageThisMonth is freshly added; the generated api types lag until the next
// `convex dev`, so reference it untyped (the repository's established pattern).
const usageApi = (api as any).agent.usage;

describe("user usage dashboard query", () => {
  it("aggregates the caller's own usage for the month, broken down by model", async () => {
    const t = convexTest(schema, modules);
    const user = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const other = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    const thread = await t.run(async (ctx) =>
      ctx.db.insert("agentThreads", {
        userId: user,
        componentThreadId: "c",
        title: "t",
        archived: false,
        pinned: false,
        lastMessageAt: 0,
        messageCount: 0,
      }),
    );

    const log = (userId: typeof user, model: string, pt: number, ct: number) =>
      t.mutation(internal.agent.usage.logUsage, {
        userId,
        threadId: thread,
        model,
        provider: "openai",
        promptTokens: pt,
        completionTokens: ct,
        durationMs: 1,
        toolCalls: 0,
      });
    await log(user, "gpt-4o-mini", 1000, 500); // 1500 tokens
    await log(user, "gpt-4o-mini", 2000, 1000); // 3000 tokens
    await log(other, "gpt-4o-mini", 9000, 9000); // another user — must be excluded

    const usage = await t.withIdentity({ subject: user }).query(usageApi.userUsageThisMonth, {});

    expect(usage).not.toBeNull();
    expect(usage.messages).toBe(2);
    expect(usage.totalTokens).toBe(4500); // 1500 + 3000
    expect(usage.estimatedCostUsd).toBeGreaterThan(0);

    const byModel = usage.byModel["gpt-4o-mini"];
    expect(byModel.messages).toBe(2);
    expect(byModel.tokens).toBe(4500);
    expect(byModel.cost).toBeCloseTo(usage.estimatedCostUsd);
  });

  it("returns null when not authenticated", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(usageApi.userUsageThisMonth, {})).toBeNull();
  });
});
