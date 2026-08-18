import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { polar } from "./payments/polar";
import {
  initialCreditGrantFromPolarSubscription,
  subscriptionStateFromPolarSubscription,
} from "./payments/polarEvents";
import { revenueCatWebhook, stripeWebhook } from "./payments/webhooks";

const http = httpRouter();

auth.addHttpRoutes(http);

// Stripe: custom handler verifies signature + syncs the userSubscriptions table
// (consumes metadata.tier + client_reference_id set in createCheckoutSession).
http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });

// Polar: the component verifies the webhook signature. These callbacks bridge
// Polar subscription events into the unified userSubscriptions table (the source
// of truth read by api.payments.subscription.mySubscription). The component links
// the Polar customer to our Convex userId via external_id.
const syncPolarSubscription = async (ctx: any, event: { data: any }) => {
  const sub = event.data;
  const userId: string | undefined =
    sub?.customer?.externalId ?? sub?.customerExternalId ?? sub?.metadata?.userId;
  if (!userId) return;
  // tier/status/expiry decision is pure + unit-tested in payments/polarEvents.ts.
  const state = subscriptionStateFromPolarSubscription(sub);
  await ctx.runMutation(internal.payments.upsertPolarSubscription, {
    userId,
    tier: state.tier,
    status: state.status,
    expiresAt: state.expiresAt,
  });
};

// On creation, also deposit the initial credit allowance. Granting on `updated`
// would over-grant (it fires for many reasons), and the component exposes no
// renewal/order callback — so Polar credits are initial-only by design (recurring
// would need a raw Polar order webhook). See payments/polarEvents.ts.
const onPolarSubscriptionCreated = async (ctx: any, event: { data: any }) => {
  await syncPolarSubscription(ctx, event);
  const grant = initialCreditGrantFromPolarSubscription(event.data);
  if (grant) {
    await ctx.runMutation(internal.payments.credits.grantSubscriptionCredits, {
      userId: grant.userId,
      credits: grant.credits,
      idempotencyKey: grant.idempotencyKey,
      reason: "Polar subscription credits (initial)",
    });
  }
};

polar.registerRoutes(http, {
  path: "/polar/events",
  onSubscriptionCreated: onPolarSubscriptionCreated,
  onSubscriptionUpdated: syncPolarSubscription,
});

// RevenueCat: mobile-side billing. Auth verified via REVENUECAT_WEBHOOK_SECRET.
http.route({
  path: "/revenuecat/webhook",
  method: "POST",
  handler: revenueCatWebhook,
});

export default http;
