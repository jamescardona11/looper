// Persistence layer for the payments feature.
//
// The webhook handlers (payments/webhooks.ts), the RevenueCat sync action
// (payments/revenueCat.ts), and the Stripe portal action (payments/stripe.ts)
// reference these as `internal.payments.*` / `api.payments.stripeCustomerForUser`.
// They all read/write the unified `userSubscriptions` + `paymentEvents` tables
// defined in payments/schema.ts.
//
// This module lives at convex/payments.ts (module path "payments") alongside the
// convex/payments/ directory (module paths "payments/stripe", "payments/subscription", …).

import { getAuthUserId } from "@convex-dev/auth/server";
import { tierFromRevenueCatEntitlement } from "@looper/config/billing";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, query } from "./_generated/server";

type SubTier = "free" | "pro" | "ultra";
type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "none";
type SubSource = "stripe" | "polar" | "revenuecat" | "manual";

const tierValidator = v.union(v.literal("free"), v.literal("pro"), v.literal("ultra"));
const statusValidator = v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("expired"),
  v.literal("none"),
);

// Single write path for userSubscriptions. Persists only the active provider's
// external ids — preserving unspecified ids for the same provider, and clearing
// the OTHER providers' ids so a stale stripeCustomerId left over from a previous
// provider can't later open the wrong customer portal. Then patch or insert.
async function commitSubscription(
  ctx: MutationCtx,
  existing: Doc<"userSubscriptions"> | null,
  input: {
    userId: Id<"users">;
    source: SubSource;
    tier: SubTier;
    status: SubStatus;
    expiresAt?: number;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    revenueCatAppUserId?: string;
    revenueCatEntitlement?: string;
    lastWebhookEvent?: string;
    // Provider event time. When older than the last applied event, the update is
    // dropped (out-of-order delivery). Omit for non-ordered callers (e.g. the
    // app-driven sync), which then always apply.
    eventAtMs?: number;
    // Lifetime/permanent entitlement (one-time purchase). Once true, the row
    // resists downgrades from recurring events.
    permanent?: boolean;
  },
): Promise<void> {
  if (
    existing?.lastEventAt != null &&
    input.eventAtMs != null &&
    input.eventAtMs < existing.lastEventAt
  ) {
    return;
  }
  // Permanence guard: a lifetime purchase pins this row. Ignore any later
  // recurring/external event (subscription.updated/deleted, invoice) that would
  // otherwise downgrade the tier or set an expiry — those events would clobber
  // the permanent entitlement back to an expiring/free plan.
  if (existing?.permanent && !input.permanent) {
    return;
  }
  const isStripe = input.source === "stripe";
  const isRc = input.source === "revenuecat";
  const fields = {
    userId: input.userId,
    tier: input.tier,
    status: input.status,
    source: input.source,
    expiresAt: input.expiresAt,
    // Sticky: once a lifetime purchase sets it, later events keep it true.
    permanent: input.permanent ? true : existing?.permanent,
    lastSyncedAt: Date.now(),
    lastEventAt: input.eventAtMs ?? existing?.lastEventAt,
    lastWebhookEvent: input.lastWebhookEvent ?? existing?.lastWebhookEvent,
    stripeCustomerId: isStripe ? (input.stripeCustomerId ?? existing?.stripeCustomerId) : undefined,
    stripeSubscriptionId: isStripe
      ? (input.stripeSubscriptionId ?? existing?.stripeSubscriptionId)
      : undefined,
    revenueCatAppUserId: isRc
      ? (input.revenueCatAppUserId ?? existing?.revenueCatAppUserId)
      : undefined,
    revenueCatEntitlement: isRc ? input.revenueCatEntitlement : undefined,
  };
  if (existing) {
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("userSubscriptions", fields);
  }
}

// Highest active RevenueCat entitlement → tier (ultra > pro > free). Any active
// entitlement grants at least Pro even if its dashboard identifier isn't a known
// tier id. Shared by the sync action and the webhook so both resolve identically.
function resolveRcTier(entitlements: string[]): SubTier {
  let tier: SubTier = "free";
  for (const ent of entitlements) {
    const t = tierFromRevenueCatEntitlement(ent);
    if (t === "ultra") return "ultra";
    if (t === "pro") tier = "pro";
  }
  if (tier === "free" && entitlements.length > 0) tier = "pro";
  return tier;
}

// Idempotency guard: has this provider event id already been processed?
export const findEventById = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    return await ctx.db
      .query("paymentEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first();
  },
});

// Append-only audit log of processed webhook events.
export const logPaymentEvent = internalMutation({
  args: {
    source: v.union(v.literal("stripe"), v.literal("polar"), v.literal("revenuecat")),
    eventType: v.string(),
    eventId: v.string(),
    userId: v.optional(v.id("users")),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("paymentEvents", { ...args, processedAt: Date.now() });
  },
});

// Stripe `checkout.session.completed` → create or update the user's row.
export const upsertStripeSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    tier: tierValidator,
    status: statusValidator,
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    eventAtMs: v.optional(v.number()),
    permanent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    await commitSubscription(ctx, existing, {
      userId: args.userId,
      source: "stripe",
      tier: args.tier,
      status: args.status,
      expiresAt: args.expiresAt,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      lastWebhookEvent: "checkout.session.completed",
      eventAtMs: args.eventAtMs,
      permanent: args.permanent,
    });
  },
});

// Read a user's current subscription row. Used by the lifetime webhook branch to
// avoid downgrading a higher tier and to find the recurring sub it must cancel.
export const getSubscriptionByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

// Stripe `customer.subscription.*` → reconcile by Stripe customer id.
export const updateByStripeCustomer = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    tier: tierValidator,
    status: statusValidator,
    stripeSubscriptionId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    eventAtMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();
    // The checkout.session.completed handler creates the row first; if it does
    // not exist yet (out-of-order delivery) there is nothing to reconcile.
    if (!row) return;
    await commitSubscription(ctx, row, {
      userId: row.userId,
      source: "stripe",
      tier: args.tier,
      status: args.status,
      expiresAt: args.expiresAt,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      eventAtMs: args.eventAtMs,
    });
  },
});

// Polar subscription.created / subscription.updated → upsert by Convex userId.
export const upsertPolarSubscription = internalMutation({
  args: {
    // String (not v.id): the value comes from a webhook (metadata.userId or the
    // customer external id) and may not be a Convex user id — validate below
    // instead of letting the arg validator throw and force endless retries.
    userId: v.string(),
    tier: tierValidator,
    status: statusValidator,
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.db.normalizeId("users", args.userId);
    if (!userId) return;
    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    await commitSubscription(ctx, existing, {
      userId,
      source: "polar",
      tier: args.tier,
      status: args.status,
      expiresAt: args.expiresAt,
    });
  },
});

// RevenueCat webhook → reconcile by RC app user id, falling back to the Convex
// user id (the client sets the RC appUserID to it) when no row is linked yet.
export const updateByRevenueCatAppUser = internalMutation({
  args: {
    revenueCatAppUserId: v.string(),
    tier: tierValidator,
    status: statusValidator,
    entitlement: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    eventAtMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const byAppUser = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_revenuecat_app_user", (q) =>
        q.eq("revenueCatAppUserId", args.revenueCatAppUserId),
      )
      .first();
    // normalizeId returns null for RC anonymous ids ($RCAnonymousID:...).
    const userId = byAppUser?.userId ?? ctx.db.normalizeId("users", args.revenueCatAppUserId);
    if (!userId) return;
    const existing =
      byAppUser ??
      (await ctx.db
        .query("userSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first());
    await commitSubscription(ctx, existing, {
      userId,
      source: "revenuecat",
      tier: args.tier,
      status: args.status,
      expiresAt: args.expiresAt,
      revenueCatAppUserId: args.revenueCatAppUserId,
      revenueCatEntitlement: args.entitlement,
      eventAtMs: args.eventAtMs,
    });
  },
});

// RevenueCat sync action → upsert by Convex userId and link the RC app user id.
export const upsertRevenueCatSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    appUserId: v.string(),
    rawSubscriber: v.string(),
    activeEntitlements: v.array(v.string()),
    // When the active entitlement was purchased (ms). Lets the ordering guard
    // drop this app-driven sync if a newer webhook (e.g. EXPIRATION) already
    // terminated the subscription while the REST read was still stale.
    eventAtMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tier = resolveRcTier(args.activeEntitlements);
    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    await commitSubscription(ctx, existing, {
      userId: args.userId,
      source: "revenuecat",
      tier,
      status: tier === "free" ? "none" : "active",
      revenueCatAppUserId: args.appUserId,
      revenueCatEntitlement: args.activeEntitlements[0],
      eventAtMs: args.eventAtMs,
    });
  },
});

// A valid email for a user — their real one if set, otherwise a synthetic
// placeholder so anonymous users can still be created as a Polar customer
// (Polar requires a syntactically valid email).
export const emailForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const email = user && "email" in user ? (user as { email?: unknown }).email : undefined;
    // Fallback domain must have valid MX records — Polar rejects undeliverable
    // domains (e.g. example.com). gmail.com passes the domain-level check.
    return typeof email === "string" && email.includes("@") ? email : `anon-${userId}@gmail.com`;
  },
});

// Public query: the Stripe customer id for the signed-in user (createPortalSession).
export const stripeCustomerForUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row?.stripeCustomerId ? { stripeCustomerId: row.stripeCustomerId } : null;
  },
});
