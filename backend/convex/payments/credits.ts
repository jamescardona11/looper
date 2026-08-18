// Consumable credit ledger.
//
// Two tables (payments/schema.ts): `creditBalance` (current balance, one row per
// user) + `creditTransactions` (append-only audit, with `idempotencyKey` so a
// retried webhook or job never double-applies).
//
// Grants come from purchases (webhook → grantCreditsForPurchase). Consumption
// happens as OVERFLOW once the daily tier limit is hit (agent/credits.ts calls
// `deductCredits` directly — a Convex mutation can't ctx.runMutation, so the
// shared logic lives in plain helpers and thin mutation/query wrappers expose it).

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx, query } from "../_generated/server";

type GrantType = "grant" | "topup" | "refund" | "adjustment";

// Current balance for a user (0 if no row yet). Plain helper for reuse.
export async function getCreditBalance(ctx: QueryCtx, userId: Id<"users">): Promise<number> {
  const row = await ctx.db
    .query("creditBalance")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return row?.balance ?? 0;
}

// Idempotent: a transaction already recorded under `idempotencyKey` is a no-op.
async function alreadyApplied(ctx: MutationCtx, idempotencyKey: string): Promise<boolean> {
  const dup = await ctx.db
    .query("creditTransactions")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  return dup !== null;
}

// Add credits to a user's balance. Idempotent on `idempotencyKey`. Plain helper
// so it can run inside any mutation (webhook wrapper, admin grant, etc.).
export async function addCredits(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    amount: number;
    type: GrantType;
    idempotencyKey: string;
    reason?: string;
  },
): Promise<void> {
  if (args.amount <= 0) return;
  if (await alreadyApplied(ctx, args.idempotencyKey)) return;

  const existing = await ctx.db
    .query("creditBalance")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  const balanceAfter = (existing?.balance ?? 0) + args.amount;

  if (existing) {
    await ctx.db.patch(existing._id, { balance: balanceAfter, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("creditBalance", {
      userId: args.userId,
      balance: balanceAfter,
      updatedAt: Date.now(),
    });
  }
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: args.amount,
    type: args.type,
    balanceAfter,
    idempotencyKey: args.idempotencyKey,
    reason: args.reason,
    createdAt: Date.now(),
  });
}

// Deduct credits IF the balance covers it. Returns ok=false (without touching the
// balance) when there aren't enough — the caller then enforces the tier limit.
// Idempotent: a retried consume with the same key is treated as success.
export async function deductCredits(
  ctx: MutationCtx,
  args: { userId: Id<"users">; amount: number; idempotencyKey: string; reason?: string },
): Promise<{ ok: boolean; balance: number }> {
  if (await alreadyApplied(ctx, args.idempotencyKey)) {
    return { ok: true, balance: await getCreditBalance(ctx, args.userId) };
  }
  const existing = await ctx.db
    .query("creditBalance")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  const balance = existing?.balance ?? 0;
  if (!existing || balance < args.amount) return { ok: false, balance };

  const balanceAfter = balance - args.amount;
  await ctx.db.patch(existing._id, { balance: balanceAfter, updatedAt: Date.now() });
  await ctx.db.insert("creditTransactions", {
    userId: args.userId,
    amount: -args.amount,
    type: "consume",
    balanceAfter,
    idempotencyKey: args.idempotencyKey,
    reason: args.reason,
    createdAt: Date.now(),
  });
  return { ok: true, balance: balanceAfter };
}

// Webhook entry point: a successful purchase deposits credits. The provider event
// id is the idempotency key so retries don't double-grant.
export const grantCreditsForPurchase = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    type: v.union(v.literal("grant"), v.literal("topup")),
    idempotencyKey: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await addCredits(ctx, args);
  },
});

// Subscription renewal entry point: the `invoice.paid` webhook deposits the
// plan's per-cycle credit allowance. Resolves the user from the Stripe customer
// id (linked on the userSubscriptions row by checkout.session.completed). The
// provider event id is the idempotency key, so one grant per billing period.
export const grantSubscriptionCredits = internalMutation({
  args: {
    // Preferred: userId stamped on the subscription metadata (race-proof — does
    // not depend on the userSubscriptions row being linked yet). Validated as a
    // string and normalized below rather than v.id, since it comes from a webhook.
    userId: v.optional(v.string()),
    // Fallback: resolve via the Stripe customer id on the userSubscriptions row.
    stripeCustomerId: v.optional(v.string()),
    // RevenueCat fallback: resolve via the RC app user id (linked row, else the
    // Convex user id the client set as the appUserID). Mirrors updateByRevenueCatAppUser.
    revenueCatAppUserId: v.optional(v.string()),
    credits: v.number(),
    idempotencyKey: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let userId = args.userId ? ctx.db.normalizeId("users", args.userId) : null;
    if (!userId && args.stripeCustomerId) {
      const row = await ctx.db
        .query("userSubscriptions")
        .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
        .first();
      userId = row?.userId ?? null;
    }
    if (!userId && args.revenueCatAppUserId) {
      const row = await ctx.db
        .query("userSubscriptions")
        .withIndex("by_revenuecat_app_user", (q) =>
          q.eq("revenueCatAppUserId", args.revenueCatAppUserId),
        )
        .first();
      userId = row?.userId ?? ctx.db.normalizeId("users", args.revenueCatAppUserId);
    }
    if (!userId) return; // can't resolve the user → skip
    await addCredits(ctx, {
      userId,
      amount: args.credits,
      type: "grant",
      idempotencyKey: args.idempotencyKey,
      reason: args.reason,
    });
  },
});

// Public: the signed-in user's credit balance (reactive). The UI reads this; the
// unified billing summary in agent/credits.ts also folds it in.
export const myCredits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    return getCreditBalance(ctx, userId);
  },
});
