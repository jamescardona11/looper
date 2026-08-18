import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

// convex-test needs every function module so internal mutations resolve.
// import.meta.glob is provided by Vite/Vitest at test time; tsc doesn't type it.
const modules = (
  import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }
).glob("../**/*.ts");

describe("subscription permanence guard (lifetime)", () => {
  it("a permanent row resists downgrade + expiry from a later recurring event", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    // 1. User has an active recurring Ultra subscription.
    await t.mutation(internal.payments.upsertStripeSubscription, {
      userId,
      tier: "ultra",
      status: "active",
      stripeCustomerId: "cus_perm_test",
      stripeSubscriptionId: "sub_perm_test",
      eventAtMs: 1_000,
    });

    // 2. Buys lifetime → permanent, no expiry.
    await t.mutation(internal.payments.upsertStripeSubscription, {
      userId,
      tier: "ultra",
      status: "active",
      stripeCustomerId: "cus_perm_test",
      eventAtMs: 2_000,
      permanent: true,
    });

    // 3. Canceling the recurring sub emits subscription.deleted, which tries to
    //    downgrade to free + set an expiry. The permanence guard must ignore it.
    await t.mutation(internal.payments.updateByStripeCustomer, {
      stripeCustomerId: "cus_perm_test",
      tier: "free",
      status: "canceled",
      stripeSubscriptionId: "sub_perm_test",
      expiresAt: 3_000,
      eventAtMs: 4_000,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    );
    expect(row?.permanent).toBe(true);
    expect(row?.tier).toBe("ultra"); // not downgraded
    expect(row?.expiresAt).toBeUndefined(); // still permanent
  });

  it("a normal (non-permanent) subscription still downgrades on cancellation", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    await t.mutation(internal.payments.upsertStripeSubscription, {
      userId,
      tier: "ultra",
      status: "active",
      stripeCustomerId: "cus_norm_test",
      stripeSubscriptionId: "sub_norm_test",
      eventAtMs: 1_000,
    });
    await t.mutation(internal.payments.updateByStripeCustomer, {
      stripeCustomerId: "cus_norm_test",
      tier: "free",
      status: "canceled",
      stripeSubscriptionId: "sub_norm_test",
      expiresAt: 3_000,
      eventAtMs: 4_000,
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    );
    expect(row?.tier).toBe("free"); // downgrade applies normally
    expect(row?.status).toBe("canceled");
  });
});
