// Table definitions for the payments-unified extra.
// Import and spread these into your root convex/schema.ts:
//
//   import { defineSchema } from "convex/server";
//   import { authTables } from "@convex-dev/auth/server";
//   import { paymentsTables } from "./payments/schema";
//
//   export default defineSchema({
//     ...authTables,
//     ...paymentsTables,
//     // your app tables here
//   });
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const paymentsTables = {
  // Subscription state per user. Single source of truth across web + mobile.
  // Webhook handlers from Stripe and RevenueCat both update this same row.
  // The `source` field tells you which provider owns this subscription.
  userSubscriptions: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("expired"),
      v.literal("none"),
    ),
    source: v.union(
      v.literal("stripe"),
      v.literal("polar"),
      v.literal("revenuecat"),
      v.literal("manual"),
    ),
    // External identifiers for reconciliation
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    revenueCatAppUserId: v.optional(v.string()),
    revenueCatEntitlement: v.optional(v.string()),
    // Lifecycle
    expiresAt: v.optional(v.number()), // ms epoch; undefined = no expiration
    canceledAt: v.optional(v.number()),
    // Lifetime/permanent entitlement (one-time purchase). When true, recurring
    // webhook events (subscription.updated/deleted, invoice) must NOT downgrade
    // or expire this row — see commitSubscription's permanence guard.
    permanent: v.optional(v.boolean()),
    // Last sync timestamps
    lastSyncedAt: v.number(),
    lastWebhookEvent: v.optional(v.string()),
    // Provider event time (ms epoch) of the last applied update. Used to drop
    // out-of-order webhook deliveries (e.g. subscription.updated arriving after
    // subscription.deleted) so a stale event can't resurrect a cancelled plan.
    lastEventAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_revenuecat_app_user", ["revenueCatAppUserId"]),

  // Consumable credit balance per user. Top-up / lifetime / subscription grants
  // deposit here; the agent consumes from it as overflow once the daily tier
  // limit is hit (see agent/credits.ts). One row per user.
  creditBalance: defineTable({
    userId: v.id("users"),
    balance: v.number(), // available credits; never negative
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Append-only ledger of every credit change. `idempotencyKey` makes grants and
  // consumptions safe under webhook retries / job retries — the same key is never
  // applied twice. For purchase grants the key is the provider event id; for
  // consumption it's the billable action id (e.g. message id).
  creditTransactions: defineTable({
    userId: v.id("users"),
    amount: v.number(), // + for grant/topup/refund, - for consume
    type: v.union(
      v.literal("grant"), // subscription allowance
      v.literal("topup"), // one-time credit pack
      v.literal("consume"),
      v.literal("refund"),
      v.literal("adjustment"), // admin / promo
    ),
    balanceAfter: v.number(),
    idempotencyKey: v.string(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_idempotency", ["idempotencyKey"]),

  // Audit log of webhook events for debugging + reconciliation.
  // Retain ~90 days, then prune via cron.
  paymentEvents: defineTable({
    source: v.union(v.literal("stripe"), v.literal("polar"), v.literal("revenuecat")),
    eventType: v.string(), // e.g. "checkout.session.completed"
    eventId: v.string(), // provider-side event id, used for idempotency
    userId: v.optional(v.id("users")),
    payload: v.string(), // raw JSON payload for debugging
    processedAt: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_event_id", ["eventId"])
    .index("by_user", ["userId"]),
};
