import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

// import.meta.glob is provided by Vite/Vitest at test time; tsc doesn't type it.
const modules = (
  import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }
).glob("./**/*.ts");

const balanceOf = (t: ReturnType<typeof convexTest>, userId: string) =>
  t.run(async (ctx) => {
    const rows = await ctx.db.query("creditBalance").collect();
    return rows.find((r) => r.userId === userId)?.balance ?? 0;
  });

describe("grantSubscriptionCredits — RevenueCat resolution", () => {
  it("resolves the user via the linked RC app-user row and deposits credits", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await t.run(async (ctx) =>
      ctx.db.insert("userSubscriptions", {
        userId,
        tier: "pro",
        status: "active",
        source: "revenuecat",
        revenueCatAppUserId: "$RCAnonymousID:abc", // a non-normalizable RC id
        lastSyncedAt: 0,
      }),
    );

    await t.mutation(internal.payments.credits.grantSubscriptionCredits, {
      revenueCatAppUserId: "$RCAnonymousID:abc",
      credits: 100,
      idempotencyKey: "rc_evt_1",
    });

    expect(await balanceOf(t, userId)).toBe(100);
  });

  it("falls back to normalizeId when the RC app-user id IS the Convex user id", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    // No linked row — the client set the RC appUserID to the Convex user id.
    await t.mutation(internal.payments.credits.grantSubscriptionCredits, {
      revenueCatAppUserId: userId,
      credits: 500,
      idempotencyKey: "rc_evt_2",
    });

    expect(await balanceOf(t, userId)).toBe(500);
  });

  it("is idempotent on the event key (one deposit per period)", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    for (let i = 0; i < 2; i++) {
      await t.mutation(internal.payments.credits.grantSubscriptionCredits, {
        revenueCatAppUserId: userId,
        credits: 100,
        idempotencyKey: "rc_evt_dup",
      });
    }

    expect(await balanceOf(t, userId)).toBe(100); // not 200
  });
});
