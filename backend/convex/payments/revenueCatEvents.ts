// Pure decision: does a RevenueCat webhook event grant subscription credits, and
// to whom? The RC analogue of payments/stripeEvents.creditGrantFromInvoice. The
// webhook (payments/webhooks.ts) stays a thin adapter: auth → reconcile tier →
// call this → apply. Pure, so it's the test surface (no RC events needed).
import {
  subscriptionCreditsForRevenueCatProduct,
  type Tier,
  tierFromRevenueCatEntitlement,
} from "@looper/config/billing";

export interface RevenueCatEventLike {
  type: string;
  app_user_id: string;
  product_id?: string;
}

export interface RevenueCatSubscriptionEventLike {
  type: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number;
}

export interface RevenueCatSubscriptionState {
  tier: Tier;
  status: "active" | "canceled" | "expired" | "past_due";
  expiresAt?: number;
  entitlement?: string;
}

// Maps a RevenueCat webhook event to our stored subscription state. The first
// entitlement id wins; with an entitlement the tier resolves via
// tierFromRevenueCatEntitlement falling back to pro, with none it is free.
// Status collapse: CANCELLATION→canceled, EXPIRATION→expired,
// BILLING_ISSUE→past_due, everything else→active. expiresAt passes through
// expiration_at_ms. Pure: existing state is never read.
export function subscriptionStateFromRevenueCatEvent(
  event: RevenueCatSubscriptionEventLike,
): RevenueCatSubscriptionState {
  const entitlement = event.entitlement_ids?.[0];
  const tier = entitlement ? (tierFromRevenueCatEntitlement(entitlement) ?? "pro") : "free";
  const status =
    event.type === "CANCELLATION"
      ? "canceled"
      : event.type === "EXPIRATION"
        ? "expired"
        : event.type === "BILLING_ISSUE"
          ? "past_due"
          : "active";
  return { tier, status, expiresAt: event.expiration_at_ms, entitlement };
}

export interface RevenueCatCreditGrant {
  credits: number;
  appUserId: string;
}

// Grants the plan's per-cycle allowance on the initial purchase and each renewal
// — mirroring Stripe's invoice.paid. All other event types (CANCELLATION,
// EXPIRATION, PRODUCT_CHANGE, BILLING_ISSUE, …) do NOT grant. Unknown/blank
// product or missing app_user_id → null.
export function creditGrantFromRevenueCatEvent(
  event: RevenueCatEventLike,
): RevenueCatCreditGrant | null {
  if (event.type !== "INITIAL_PURCHASE" && event.type !== "RENEWAL") return null;
  const credits = event.product_id ? subscriptionCreditsForRevenueCatProduct(event.product_id) : 0;
  if (credits <= 0) return null;
  if (!event.app_user_id) return null;
  return { credits, appUserId: event.app_user_id };
}
