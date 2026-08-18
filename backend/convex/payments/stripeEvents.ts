// Pure decisions derived from Stripe webhook events. Extracted from the webhook
// handler so the policy is the test surface — no Stripe events or Convex runtime
// needed to verify it. The webhook (payments/webhooks.ts) stays a thin adapter:
// verify signature → fetch any existing subscription → call these → apply effects.
//
// Every function here is pure: existing state is INJECTED, never read inside.
import {
  type OneTimePack,
  oneTimeGrant,
  type StripePriceOverrides,
  subscriptionCreditsForStripePrice,
  type Tier,
  tierFromStripePriceId,
  tierSatisfies,
} from "@looper/config/billing";

// ── invoice.paid → recurring subscription credit grant ───────────────────────

// The subset of a Stripe.Invoice we read. Kept structural so tests can build one
// without the Stripe SDK, and so the 2026 API's nested metadata path is explicit.
export interface InvoiceLike {
  billing_reason?: string | null;
  customer?: string | null;
  lines?: {
    data?: Array<{
      price?: { id?: string };
      plan?: { id?: string };
      pricing?: { price_details?: { price?: string } };
    }>;
  };
  parent?: { subscription_details?: { metadata?: Record<string, string> } };
  subscription_details?: { metadata?: Record<string, string> };
}

export interface InvoiceCreditGrant {
  credits: number;
  /** Preferred: userId stamped on the subscription metadata at checkout. */
  subUserId?: string;
  /** Fallback: resolve the user by Stripe customer id. */
  customerId?: string;
}

// Returns the grant to apply, or null when the invoice must NOT grant credits.
// Null cases (each previously inline, now testable):
//   - not a cycle invoice (proration/upgrade `subscription_update`, manual, …)
//     → would otherwise hand out a full extra allowance mid-cycle (bug #1)
//   - the line's price maps to no plan credits (e.g. free tier)
//   - we can resolve neither a userId nor a customer to credit
export function creditGrantFromInvoice(
  invoice: InvoiceLike,
  stripePriceOverrides: StripePriceOverrides = {},
): InvoiceCreditGrant | null {
  const reason = invoice.billing_reason;
  const isCycleInvoice = reason === "subscription_create" || reason === "subscription_cycle";
  if (!isCycleInvoice) return null;

  const line = invoice.lines?.data?.[0];
  const priceId = line?.price?.id ?? line?.plan?.id ?? line?.pricing?.price_details?.price;
  const credits = priceId ? subscriptionCreditsForStripePrice(priceId, stripePriceOverrides) : 0;
  if (credits <= 0) return null;

  const subUserId =
    invoice.parent?.subscription_details?.metadata?.userId ??
    invoice.subscription_details?.metadata?.userId;
  const customerId = invoice.customer ?? undefined;
  if (!subUserId && !customerId) return null;

  return { credits, subUserId, customerId };
}

// ── customer.subscription.created/updated → stored subscription state ─────────

export interface StripeSubscriptionLike {
  id: string;
  status?: string | null;
  cancel_at?: number | null;
  items?: { data?: Array<{ price?: { id?: string } }> };
}

export interface SubscriptionState {
  tier: Tier;
  status: "active" | "trialing" | "past_due";
  stripeSubscriptionId: string;
  expiresAt?: number;
}

// Maps a live Stripe subscription to our stored state. Unknown/blank price → pro
// (any active paid sub is at least Pro). Any status other than active/trialing →
// past_due (grace period, not a downgrade — real cancels arrive as a separate
// subscription.deleted event).
export function subscriptionStateFromStripeSub(
  sub: StripeSubscriptionLike,
  stripePriceOverrides: StripePriceOverrides = {},
): SubscriptionState {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const tier = priceId ? (tierFromStripePriceId(priceId, stripePriceOverrides) ?? "pro") : "pro";
  const status =
    sub.status === "active" ? "active" : sub.status === "trialing" ? "trialing" : "past_due";
  return {
    tier,
    status,
    stripeSubscriptionId: sub.id,
    expiresAt: sub.cancel_at ? sub.cancel_at * 1000 : undefined,
  };
}

// ── checkout.session.completed (one-time) → lifetime/credit plan ─────────────

export interface ExistingSubscription {
  tier: Tier;
  status: string;
  stripeSubscriptionId?: string;
}

export interface OneTimeCheckoutPlan {
  /** Grant a permanent tier (lifetime), already resolved to not downgrade. */
  lifetimeTier?: Tier;
  /** Cancel this recurring sub at period end ("lifetime = no more monthly"). */
  cancelStripeSubscriptionId?: string;
  /** One-time credit stash to deposit. */
  credits?: number;
}

// Returns the plan for a one-time checkout, or null when the session is not a
// one-time purchase (caller falls through to the subscription branch).
export function oneTimeCheckoutPlan(
  metadata: { type?: string; pack?: string } | null | undefined,
  existing: ExistingSubscription | null,
): OneTimeCheckoutPlan | null {
  if (metadata?.type !== "one_time") return null;
  const pack = metadata.pack as OneTimePack | undefined;
  const grant = pack ? oneTimeGrant(pack) : {};
  const plan: OneTimeCheckoutPlan = {};
  if (grant.tier) {
    // Don't downgrade: keep the higher of the current tier and the grant.
    plan.lifetimeTier =
      existing && tierSatisfies(existing.tier, grant.tier) ? existing.tier : grant.tier;
    // Stop the recurring sub so the lifetime buyer isn't billed again.
    if (
      existing?.stripeSubscriptionId &&
      (existing.status === "active" || existing.status === "trialing")
    ) {
      plan.cancelStripeSubscriptionId = existing.stripeSubscriptionId;
    }
  }
  if (grant.credits) plan.credits = grant.credits;
  return plan;
}
