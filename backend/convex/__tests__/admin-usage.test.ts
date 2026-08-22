import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// import.meta.glob is provided by Vite/Vitest at test time; tsc doesn't type it.
const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "",
);

describe("admin usage dashboard queries", () => {
  it("aggregates spend across all users and per user (top spenders first)", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const other = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => ctx.db.insert("adminUsers", { userId: admin }));

    const thread = await t.run(async (ctx) =>
      ctx.db.insert("agentThreads", {
        userId: admin,
        componentThreadId: "c",
        title: "t",
        archived: false,
        pinned: false,
        lastMessageAt: 0,
        messageCount: 0,
      }),
    );

    const log = (userId: typeof admin, pt: number, ct: number) =>
      t.mutation(internal.agent.usage.logUsage, {
        userId,
        threadId: thread,
        model: "gpt-4o-mini",
        provider: "openai",
        promptTokens: pt,
        completionTokens: ct,
        durationMs: 1,
        toolCalls: 0,
      });
    await log(admin, 1000, 500); // 1500 tokens
    await log(other, 2000, 1000); // 3000 tokens
    await log(other, 1000, 0); // 1000 tokens  → other total 4000

    const asAdmin = t.withIdentity({ subject: admin });

    const stats = await asAdmin.query(api.admin.getUsageStats, {});
    expect(stats.messages).toBe(3);
    expect(stats.totalTokens).toBe(5500); // 1500 + 3000 + 1000
    expect(stats.estimatedCostUsd).toBeGreaterThan(0);

    const byUser = await asAdmin.query(api.admin.getUsageByUser, {});
    expect(byUser).toHaveLength(2);
    expect(byUser[0]!.totalTokens).toBe(4000); // "other" spends most → first
    expect(byUser[1]!.totalTokens).toBe(1500);
    expect(byUser[0]!.estimatedCostUsd).toBeGreaterThanOrEqual(byUser[1]!.estimatedCostUsd);
  });

  it("denies non-admins (the dashboard route guard's backend)", async () => {
    const t = convexTest(schema, modules);
    const u = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await expect(
      t.withIdentity({ subject: u }).query(api.admin.getUsageStats, {}),
    ).rejects.toThrow();
  });
});

describe("admin management mutations", () => {
  it("promotes a user and remains idempotent", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const target = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => ctx.db.insert("adminUsers", { userId: admin }));

    const asAdmin = t.withIdentity({ subject: admin });
    await asAdmin.mutation(api.admin.promoteToAdmin, { userId: target });
    await asAdmin.mutation(api.admin.promoteToAdmin, { userId: target });

    const grants = await t.run(async (ctx) =>
      ctx.db
        .query("adminUsers")
        .withIndex("by_user", (q) => q.eq("userId", target))
        .collect(),
    );
    expect(grants).toHaveLength(1);
    expect(await t.withIdentity({ subject: target }).query(api.admin.isAdmin, {})).toBe(true);
  });

  it("demotes one of two database-managed admins", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const target = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => {
      await ctx.db.insert("adminUsers", { userId: admin });
      await ctx.db.insert("adminUsers", { userId: target });
    });

    await t
      .withIdentity({ subject: admin })
      .mutation(api.admin.demoteFromAdmin, { userId: target });

    expect(await t.withIdentity({ subject: admin }).query(api.admin.isAdmin, {})).toBe(true);
    expect(await t.withIdentity({ subject: target }).query(api.admin.isAdmin, {})).toBe(false);
  });

  it("refuses to demote the last database-managed admin", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => ctx.db.insert("adminUsers", { userId: admin }));
    const asAdmin = t.withIdentity({ subject: admin });

    await expect(asAdmin.mutation(api.admin.demoteFromAdmin, { userId: admin })).rejects.toThrow(
      "Cannot demote the last admin",
    );
    expect(await asAdmin.query(api.admin.isAdmin, {})).toBe(true);
  });
});

describe("manual subscription grants", () => {
  it("allows an admin to grant a tier manually", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const target = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => ctx.db.insert("adminUsers", { userId: admin }));
    const expiresAt = Date.now() + 86_400_000;

    await t.withIdentity({ subject: admin }).mutation(api.payments.subscription.grantTierManually, {
      userId: target,
      tier: "ultra",
      expiresAt,
    });

    const subscription = await t.run(async (ctx) =>
      ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", target))
        .unique(),
    );
    expect(subscription).toMatchObject({
      userId: target,
      tier: "ultra",
      status: "active",
      source: "manual",
      expiresAt,
    });
    expect(subscription?.lastSyncedAt).toBe(subscription?.lastEventAt);
  });

  it("rejects manual grants from a non-admin", async () => {
    const t = convexTest(schema, modules);
    const caller = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const target = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    await expect(
      t.withIdentity({ subject: caller }).mutation(api.payments.subscription.grantTierManually, {
        userId: target,
        tier: "pro",
      }),
    ).rejects.toThrow("Access denied");

    const subscription = await t.run(async (ctx) =>
      ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", target))
        .unique(),
    );
    expect(subscription).toBeNull();
  });
});

describe("admin surface authorization", () => {
  it("denies every admin-only endpoint to a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const outsider = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const asOutsider = t.withIdentity({ subject: outsider });

    await expect(asOutsider.query(api.admin.listUsers, {})).rejects.toThrow("Access denied");
    await expect(asOutsider.query(api.admin.impersonateUser, { userId: outsider })).rejects.toThrow(
      "Access denied",
    );
    await expect(asOutsider.query(api.admin.getUserCount, {})).rejects.toThrow("Access denied");
    await expect(asOutsider.query(api.admin.getActiveUserCount, {})).rejects.toThrow(
      "Access denied",
    );
    await expect(asOutsider.query(api.admin.getSubscriptionStats, {})).rejects.toThrow(
      "Access denied",
    );
    await expect(asOutsider.query(api.admin.getUsageStats, {})).rejects.toThrow("Access denied");
    await expect(asOutsider.query(api.admin.getUsageByUser, {})).rejects.toThrow("Access denied");
    await expect(
      asOutsider.mutation(api.admin.promoteToAdmin, { userId: outsider }),
    ).rejects.toThrow("Access denied");
    await expect(
      asOutsider.mutation(api.admin.demoteFromAdmin, { userId: outsider }),
    ).rejects.toThrow("Access denied");
  });

  // `isAdmin` is the one requireAdmin caller that must NOT throw: it is the
  // probe the client uses to decide whether to render the admin surface at all,
  // so it swallows the denial and answers false.
  it("answers isAdmin with false for a non-admin instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const outsider = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    expect(await t.withIdentity({ subject: outsider }).query(api.admin.isAdmin, {})).toBe(false);
  });

  it("serves the same endpoints to an admin (so the denial above is authorization, not breakage)", async () => {
    const t = convexTest(schema, modules);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) => ctx.db.insert("adminUsers", { userId: admin }));
    const asAdmin = t.withIdentity({ subject: admin });

    expect(await asAdmin.query(api.admin.listUsers, {})).toHaveLength(1);
    expect(await asAdmin.query(api.admin.impersonateUser, { userId: admin })).toMatchObject({
      id: admin,
    });
    expect(await asAdmin.query(api.admin.getUserCount, {})).toBe(1);
    expect(await asAdmin.query(api.admin.getActiveUserCount, {})).toBe(0);
    expect(await asAdmin.query(api.admin.getSubscriptionStats, {})).toEqual({
      free: 1,
      pro: 0,
      ultra: 0,
    });
  });
});
