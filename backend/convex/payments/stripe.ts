// Stripe actions: checkout session creation and customer portal session.
// Both return a URL the client redirects to. Convex action runs server-side so the secret
// key never reaches the browser.
//
// Env vars (set via `npx convex env set`):
//   STRIPE_SECRET_KEY     sk_test_... or sk_live_...
//   STRIPE_WEBHOOK_SECRET whsec_... (used by webhooks.ts)

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  isConfiguredBillingId,
  type OneTimePack,
  resolveStripeOneTimePriceId,
  resolveStripeTierPriceId,
  type Tier,
} from "@looper/config/billing";
import { v } from "convex/values";
import Stripe from "stripe";
import { api } from "../_generated/api";
import { action } from "../_generated/server";
import { env } from "../env";
import { stripePriceOverrides } from "./stripePriceConfig";

function getStripe(): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY env var not set");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

// Create a Stripe Checkout session for the authenticated user upgrading to a tier.
// Returns the checkout URL; client redirects via window.location.href.
export const createCheckoutSession = action({
  args: {
    tier: v.union(v.literal("pro"), v.literal("ultra")),
    interval: v.union(v.literal("monthly"), v.literal("yearly")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, { tier, interval, successUrl, cancelUrl }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in to upgrade");

    const priceId = resolveStripeTierPriceId(
      tier as Exclude<Tier, "free">,
      interval,
      stripePriceOverrides,
    );
    if (!isConfiguredBillingId(priceId)) {
      throw new Error(
        `Stripe Price ID for ${tier}/${interval} is not configured. Set the matching STRIPE_*_PRICE_ID environment variable.`,
      );
    }

    const stripe = getStripe();

    // Reuse the user's existing Stripe customer if they have one, so repeat
    // checkouts don't create duplicate Customer records (which break the portal).
    const customer = await ctx.runQuery((api as any).payments.stripeCustomerForUser, {});

    const baseParams = {
      mode: "subscription" as const,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: { userId, tier, interval },
      // Stamp the subscription too, so its invoices carry userId. The
      // `invoice.paid` webhook (recurring credit grant) reads this — making the
      // grant independent of webhook ordering vs checkout.session.completed.
      subscription_data: { metadata: { userId, tier, interval } },
      allow_promotion_codes: true,
    };
    const storedCustomer = customer?.stripeCustomerId ?? undefined;

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({ ...baseParams, customer: storedCustomer });
    } catch (err) {
      // A stored customer id can go stale (deleted, different Stripe account,
      // seed/demo data). Don't hard-fail checkout — retry letting Stripe create
      // a fresh customer (subscription mode auto-creates one when omitted).
      if (storedCustomer && err instanceof Error && /no such customer/i.test(err.message)) {
        session = await stripe.checkout.sessions.create(baseParams);
      } else {
        throw err;
      }
    }

    if (!session.url) throw new Error("Stripe did not return a session URL");
    return { url: session.url };
  },
});

// Create a one-time payment checkout (credit top-ups, lifetime deals).
// Supports card, stablecoins (USDT), and other Stripe payment methods.
export const createOneTimeCheckout = action({
  args: {
    // A configured pack key — NOT a raw Stripe price id. The server resolves it
    // to a price so a client can never check out an arbitrary (e.g. $0.01) price.
    pack: v.union(v.literal("credits_100"), v.literal("credits_500"), v.literal("lifetime")),
    successUrl: v.string(),
    cancelUrl: v.string(),
    allowCrypto: v.optional(v.boolean()),
  },
  handler: async (ctx, { pack, successUrl, cancelUrl, allowCrypto }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const priceId = resolveStripeOneTimePriceId(pack as OneTimePack, stripePriceOverrides);
    if (!isConfiguredBillingId(priceId)) {
      throw new Error(
        `Stripe price for "${pack}" is not configured. Set the matching STRIPE_*_PRICE_ID environment variable.`,
      );
    }
    const stripe = getStripe();

    const paymentMethodTypes: string[] = ["card"];
    if (allowCrypto) {
      paymentMethodTypes.push("crypto" as any);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      // `pack` lets the webhook resolve how many credits to deposit (creditsForPack).
      metadata: { userId, type: "one_time", pack },
      payment_method_types: paymentMethodTypes as any,
    });

    if (!session.url) throw new Error("Stripe did not return a session URL");
    return { url: session.url };
  },
});

// Create a Stripe Customer Portal session so the user can manage their subscription
// (change tier, update payment method, cancel). Returns the portal URL.
export const createPortalSession = action({
  args: {
    returnUrl: v.string(),
  },
  handler: async (ctx, { returnUrl }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const sub = await ctx.runQuery((api as any).payments.subscription.mySubscription, {});
    if (!sub || sub.source !== "stripe") {
      throw new Error("No Stripe subscription found for this user");
    }

    const stripe = getStripe();
    // We need the Stripe customer id. The shorter useSubscription query above hides it on purpose;
    // here we go to the table directly via a helper query to fetch it.
    const customer = await ctx.runQuery((api as any).payments.stripeCustomerForUser, {});
    if (!customer?.stripeCustomerId) {
      throw new Error("Cannot create portal session: missing Stripe customer id");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  },
});
