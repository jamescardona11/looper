// RevenueCat action: sync a purchase from the mobile client.
// The mobile app calls Purchases.purchasePackage() locally; RevenueCat validates with the App Store/Play.
// Then the mobile app calls this action with the appUserId so Convex updates users.subscription.
//
// The authoritative truth is the RevenueCat webhook (webhooks.ts), but calling syncRevenueCatPurchase
// immediately after a successful purchase gives instant feedback without waiting for the webhook latency.
//
// Env vars:
//   REVENUECAT_API_KEY        sk_... (REST API key for verification)
//   REVENUECAT_WEBHOOK_SECRET shared secret for webhook auth header

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { env } from "../env";

// Validate a RevenueCat appUserId belongs to this Convex user, then sync subscription.
// Returns the updated tier so the mobile client can refresh UI immediately.
export const syncRevenueCatPurchase = action({
  args: {
    appUserId: v.string(),
  },
  handler: async (ctx, { appUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in to sync purchases");
    if (appUserId !== userId) {
      throw new Error("RevenueCat appUserId must match the authenticated user");
    }

    const apiKey = env.REVENUECAT_API_KEY;
    if (!apiKey) throw new Error("REVENUECAT_API_KEY env var not set");

    // Hit RevenueCat REST API to read subscriber state.
    // Docs: https://docs.revenuecat.com/reference/subscribers
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`RevenueCat API ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as RCSubscriberResponse;

    // Resolve highest active entitlement to a tier (ultra > pro > free)
    const activeEntitlements = Object.entries(data.subscriber.entitlements ?? {}).filter(
      ([, e]) => e.expires_date == null || new Date(e.expires_date) > new Date(),
    );

    // Purchase time of the current access — the event-ordering key so a stale
    // REST read can't override a newer webhook (e.g. an EXPIRATION that already
    // terminated the subscription). See commitSubscription's ordering guard.
    const lastPurchaseMs = activeEntitlements.reduce<number | undefined>((max, [, e]) => {
      const ms = e.purchase_date ? new Date(e.purchase_date).getTime() : Number.NaN;
      return Number.isFinite(ms) ? Math.max(max ?? 0, ms) : max;
    }, undefined);

    // Caller (mobile app) hands us the tier resolution via a separate mutation;
    // we just persist the raw RC state here. The webhook does the authoritative resolution.
    // The actual table write happens via the internal mutation below.
    await ctx.runMutation((internal as any).payments.upsertRevenueCatSubscription, {
      userId,
      appUserId,
      rawSubscriber: JSON.stringify(data.subscriber),
      activeEntitlements: activeEntitlements.map(([key]) => key),
      eventAtMs: lastPurchaseMs,
    });

    return { activeEntitlements: activeEntitlements.map(([k]) => k) };
  },
});

interface RCSubscriberResponse {
  subscriber: {
    entitlements?: Record<
      string,
      { expires_date: string | null; purchase_date?: string | null; product_identifier: string }
    >;
    subscriptions?: Record<string, unknown>;
  };
}
