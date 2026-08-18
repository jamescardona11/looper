// Helpers for reading and gating on subscription state.
// Server-side (Convex queries, mutations, actions) consumes this.
// Client-side gating goes through hooks that read getActiveSubscription via Convex query.

import { getAuthUserId } from "@convex-dev/auth/server";
import { type Tier, tierSatisfies } from "@looper/config/billing";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireAdmin } from "../admin";

// Read the active subscription for the authenticated user.
// Returns null if no subscription row exists (treat as "free").
export async function getActiveSubscription(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const sub = await ctx.db
    .query("userSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!sub) return null;
  // No paid access on a terminal state or once the paid period has elapsed.
  // "expired"/"none" revoke immediately even if a provider omitted expiresAt;
  // "canceled" keeps access until expiresAt (cancel-at-period-end).
  const pastExpiry = sub.expiresAt != null && sub.expiresAt < Date.now();
  if (sub.status === "expired" || sub.status === "none" || pastExpiry) {
    return { ...sub, tier: "free" as Tier, status: "expired" as const };
  }
  return sub;
}

// Throws if the caller does not satisfy the required tier.
// Use in mutations and actions that gate a feature.
//
//   await requireTier(ctx, "pro");
//
export async function requireTier(
  ctx: QueryCtx | MutationCtx,
  required: Tier,
): Promise<NonNullable<Awaited<ReturnType<typeof getActiveSubscription>>>> {
  const sub = await getActiveSubscription(ctx);
  const actual = (sub?.tier ?? "free") as Tier;
  if (!tierSatisfies(actual, required)) {
    throw new Error(
      `Tier ${required} required; current tier is ${actual}. Prompt user to upgrade.`,
    );
  }
  if (!sub) {
    // Free tier satisfied free requirement; return a synthetic row for the caller
    throw new Error("Unreachable: tierSatisfies returned true with null sub");
  }
  return sub;
}

// Convex query exposed to clients for reactive subscription state.
// Both web useSubscription() and mobile useSubscription() read this.
export const mySubscription = query({
  args: {},
  handler: async (ctx) => {
    const sub = await getActiveSubscription(ctx);
    if (!sub) {
      return {
        tier: "free" as Tier,
        status: "none" as const,
        source: null,
        expiresAt: null,
      };
    }
    return {
      tier: sub.tier,
      status: sub.status,
      source: sub.source,
      expiresAt: sub.expiresAt ?? null,
    };
  },
});

// Admin-only mutation to manually grant a tier (support cases, comp access, etc.).
export const grantTierManually = mutation({
  args: {
    userId: v.id("users"),
    tier: v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { userId, tier, expiresAt }) => {
    await requireAdmin(ctx);

    const now = Date.now();
    const fields = {
      tier,
      status: (tier === "free" ? "none" : "active") as "none" | "active",
      source: "manual" as const,
      expiresAt,
      lastSyncedAt: now,
      lastEventAt: now,
    };

    const existing = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("userSubscriptions", { userId, ...fields });
    }
  },
});
