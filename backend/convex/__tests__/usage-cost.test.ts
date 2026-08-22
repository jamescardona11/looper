import { estimateCost, MODELS } from "@looper/config/agent";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { internal } from "../_generated/api";
import schema from "../schema";

// import.meta.glob is provided by Vite/Vitest at test time; tsc doesn't type it.
const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "",
);

describe("estimateCost", () => {
  it("computes $ from token counts at the model's per-1M rates", () => {
    const m = MODELS["gpt-4o-mini"]!; // $0.15 in / $0.60 out per 1M
    expect(estimateCost(1_000_000, 1_000_000, m)).toBeCloseTo(0.75, 6);
    expect(estimateCost(0, 0, m)).toBe(0);
  });
});

describe("cost tracking (logUsage owns cost)", () => {
  const newThread = (t: ReturnType<typeof convexTest>) =>
    t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const threadId = await ctx.db.insert("agentThreads", {
        userId,
        componentThreadId: "c1",
        title: "t",
        archived: false,
        pinned: false,
        lastMessageAt: 0,
        messageCount: 0,
      });
      return { userId, threadId };
    });

  it("derives cost + totalTokens from the model id — caller never passes a price", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await newThread(t);

    // Note: NO estimatedCostUsd passed. The module looks up the rates.
    await t.mutation(internal.agent.usage.logUsage, {
      userId,
      threadId,
      model: "gpt-4o-mini",
      provider: "openai",
      promptTokens: 1000,
      completionTokens: 500,
      durationMs: 10,
      toolCalls: 0,
    });

    const expected = estimateCost(1000, 500, MODELS["gpt-4o-mini"]!);
    const rows = await t.run(async (ctx) => ctx.db.query("agentUsage").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.totalTokens).toBe(1500);
    expect(rows[0]!.estimatedCostUsd).toBeCloseTo(expected, 8);
    expect(expected).toBeGreaterThan(0); // the bug was a caller passing 0
  });

  it("records 0 cost for an unknown model id (no rate entry)", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await newThread(t);

    await t.mutation(internal.agent.usage.logUsage, {
      userId,
      threadId,
      model: "some-unconfigured-model",
      provider: "openai",
      promptTokens: 1000,
      completionTokens: 500,
      durationMs: 10,
      toolCalls: 0,
    });

    const rows = await t.run(async (ctx) => ctx.db.query("agentUsage").collect());
    expect(rows[0]!.totalTokens).toBe(1500); // tokens still tracked
    expect(rows[0]!.estimatedCostUsd).toBe(0);
  });
});
