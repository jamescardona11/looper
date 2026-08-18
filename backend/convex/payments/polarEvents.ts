// Pure decision: the initial credit grant for a newly created Polar subscription.
//
// The @convex-dev/polar component only exposes onSubscription{Created,Updated}
// and onProduct{Created,Updated} — there is NO renewal/order callback. So we
// grant the allowance ONCE on creation (idempotent by subscription id); granting
// on `updated` would over-grant since that fires for many reasons. True recurring
// Polar credits would need a raw Polar `order.paid` webhook (a follow-on).
import {
  subscriptionCreditsForPolarProduct,
  type Tier,
  tierFromPolarProductId,
} from "@looper/config/billing";

export interface PolarSubscriptionLike {
  id?: string;
  productId?: string;
  product?: { id?: string };
  metadata?: { userId?: string };
  customer?: { externalId?: string };
  customerExternalId?: string;
  status?: string;
  endsAt?: string | number | null;
  currentPeriodEnd?: string | number | null;
}

export interface PolarSubscriptionState {
  tier: Tier;
  status: "active" | "past_due" | "canceled" | "expired";
  expiresAt?: number;
}

// Maps a Polar subscription to our stored state. Unknown/blank product → pro (any
// active paid sub is at least Pro). Status collapse: canceled→canceled,
// past_due→past_due, revoked→expired, everything else→active. Expiry parses
// endsAt (preferred) else currentPeriodEnd as a date → ms, dropping it when the
// parse is not a finite number. Pure: existing state is never read.
export function subscriptionStateFromPolarSubscription(
  sub: PolarSubscriptionLike,
): PolarSubscriptionState {
  const productId = sub.productId ?? sub.product?.id;
  const tier = (productId ? tierFromPolarProductId(productId) : null) ?? "pro";
  const status =
    sub.status === "canceled"
      ? "canceled"
      : sub.status === "past_due"
        ? "past_due"
        : sub.status === "revoked"
          ? "expired"
          : "active";
  const endRaw = sub.endsAt ?? sub.currentPeriodEnd ?? null;
  const endMs = endRaw ? new Date(endRaw).getTime() : Number.NaN;
  return {
    tier,
    status,
    expiresAt: Number.isFinite(endMs) ? endMs : undefined,
  };
}

export interface PolarCreditGrant {
  userId: string;
  credits: number;
  idempotencyKey: string;
}

export function initialCreditGrantFromPolarSubscription(
  sub: PolarSubscriptionLike,
): PolarCreditGrant | null {
  const userId = sub.customer?.externalId ?? sub.customerExternalId ?? sub.metadata?.userId;
  const productId = sub.productId ?? sub.product?.id;
  const credits = productId ? subscriptionCreditsForPolarProduct(productId) : 0;
  if (!userId || credits <= 0 || !sub.id) return null;
  // One grant per subscription (creation only) — keyed by the subscription id.
  return { userId, credits, idempotencyKey: `polar_sub_${sub.id}` };
}
