// HTTP endpoint handlers for Stripe and RevenueCat webhooks.
// Both update the same `userSubscriptions` table. Signature verification is mandatory
// so an attacker cannot forge a webhook to grant themselves a Pro tier.
//
// Register these in your root convex/http.ts:
//
//   import { httpRouter } from "convex/server";
//   import { stripeWebhook, revenueCatWebhook } from "./payments/webhooks";
//
//   const http = httpRouter();
//   http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });
//   http.route({ path: "/revenuecat/webhook", method: "POST", handler: revenueCatWebhook });
//   export default http;
//
// Both providers retry non-2xx responses. applyPaymentEvent records the provider
// event id and makes those retries idempotent.
import Stripe from "stripe";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { env } from "../env";
import { applyPaymentEvent } from "./applyEvent";
import {
  creditGrantFromRevenueCatEvent,
  subscriptionStateFromRevenueCatEvent,
} from "./revenueCatEvents";
import {
  creditGrantFromInvoice,
  type InvoiceLike,
  oneTimeCheckoutPlan,
  type StripeSubscriptionLike,
  subscriptionStateFromStripeSub,
} from "./stripeEvents";
import { stripePriceOverrides } from "./stripePriceConfig";

function getStripe(): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
}

// =====================================================================================
// Stripe webhook
// =====================================================================================
export const stripeWebhook = httpAction(async (ctx, request) => {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const outcome = await applyPaymentEvent({
      findExisting: async () =>
        await ctx.runQuery((internal as any).payments.findEventById, {
          eventId: event.id,
        }),
      applyEffects: async () => {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;
            if (!userId) throw new Error("Missing client_reference_id");

            // One-time purchase (credit pack / lifetime). The plan — no-downgrade,
            // cancel the recurring sub ("lifetime = no more monthly"), credits — is
            // decided purely in stripeEvents.oneTimeCheckoutPlan; here we just apply
            // it. event.id keys grants so a retried webhook can't double-grant. The
            // `permanent` flag pins the row so the cancel's subscription.updated
            // event can't clobber the lifetime back to an expiry.
            const existing =
              session.metadata?.type === "one_time"
                ? await ctx.runQuery((internal as any).payments.getSubscriptionByUser, {
                    userId: userId as Id<"users">,
                  })
                : null;
            const oneTime = oneTimeCheckoutPlan(
              session.metadata as { type?: string; pack?: string } | null,
              existing,
            );
            if (oneTime) {
              if (oneTime.cancelStripeSubscriptionId) {
                // Cancel the recurring sub BEFORE granting lifetime. If this fails, let
                // it throw: the outer catch returns 500 so Stripe retries, and the
                // lifetime grant below never runs. Swallowing it would give the user
                // lifetime access while the monthly sub keeps billing — a silent
                // double-charge. The event is not recorded as processed on a 500, so
                // the retry re-attempts the cancel idempotently.
                await getStripe().subscriptions.update(oneTime.cancelStripeSubscriptionId, {
                  cancel_at_period_end: true,
                });
              }
              if (oneTime.lifetimeTier) {
                await ctx.runMutation((internal as any).payments.upsertStripeSubscription, {
                  userId: userId as Id<"users">,
                  tier: oneTime.lifetimeTier,
                  status: "active",
                  stripeCustomerId: (session.customer as string) || undefined,
                  expiresAt: undefined,
                  eventAtMs: event.created * 1000,
                  permanent: true,
                });
              }
              if (oneTime.credits) {
                await ctx.runMutation((internal as any).payments.credits.grantCreditsForPurchase, {
                  userId: userId as Id<"users">,
                  amount: oneTime.credits,
                  type: "topup" as const,
                  idempotencyKey: event.id,
                  reason: `Stripe one-time: ${session.metadata?.pack}`,
                });
              }
              break;
            }

            const tier = (session.metadata?.tier ?? "pro") as "pro" | "ultra";
            await ctx.runMutation((internal as any).payments.upsertStripeSubscription, {
              userId: userId as Id<"users">,
              tier,
              status: "active",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              expiresAt: undefined,
              eventAtMs: event.created * 1000,
            });
            break;
          }
          case "customer.subscription.updated":
          case "customer.subscription.created": {
            const sub = event.data.object as Stripe.Subscription;
            const state = subscriptionStateFromStripeSub(
              sub as unknown as StripeSubscriptionLike,
              stripePriceOverrides,
            );
            await ctx.runMutation((internal as any).payments.updateByStripeCustomer, {
              stripeCustomerId: sub.customer as string,
              tier: state.tier,
              status: state.status,
              stripeSubscriptionId: state.stripeSubscriptionId,
              expiresAt: state.expiresAt,
              eventAtMs: event.created * 1000,
            });
            break;
          }
          case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            await ctx.runMutation((internal as any).payments.updateByStripeCustomer, {
              stripeCustomerId: sub.customer as string,
              tier: "free",
              status: "canceled",
              stripeSubscriptionId: sub.id,
              expiresAt: Date.now(),
              eventAtMs: event.created * 1000,
            });
            break;
          }
          case "invoice.paid": {
            // Recurring credit allowance: fires on the initial subscription charge
            // AND every renewal. event.id keys the grant → one deposit per period.
            // The grant DECISION (cycle-vs-proration gate, price→credits, user
            // resolution) lives in the pure `creditGrantFromInvoice` — tested there.
            const grant = creditGrantFromInvoice(
              event.data.object as unknown as InvoiceLike,
              stripePriceOverrides,
            );
            if (grant) {
              await ctx.runMutation((internal as any).payments.credits.grantSubscriptionCredits, {
                userId: grant.subUserId,
                stripeCustomerId: grant.customerId,
                credits: grant.credits,
                idempotencyKey: event.id,
                reason: "Stripe subscription credits",
              });
            }
            break;
          }
          default:
            // Logged but not actioned. Add cases as needed.
            break;
        }
      },
      recordEvent: async () => {
        await ctx.runMutation((internal as any).payments.logPaymentEvent, {
          source: "stripe" as const,
          eventType: event.type,
          eventId: event.id,
          payload: JSON.stringify(event),
        });
      },
    });

    if (outcome === "duplicate") {
      return new Response("Already processed", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Stripe webhook handler failed", err);
    return new Response("Handler error", { status: 500 });
  }
});

// =====================================================================================
// RevenueCat webhook
// =====================================================================================
export const revenueCatWebhook = httpAction(async (ctx, request) => {
  const secret = env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("REVENUECAT_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  // RevenueCat sends a shared-secret Authorization header (you configure it in the dashboard).
  const authHeader = request.headers.get("authorization");
  if (authHeader !== secret && authHeader !== `Bearer ${secret}`) {
    console.error("RevenueCat webhook auth failed");
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as RCWebhookPayload;
  const event = body.event;

  try {
    const outcome = await applyPaymentEvent({
      findExisting: async () =>
        await ctx.runQuery((internal as any).payments.findEventById, {
          eventId: event.id,
        }),
      applyEffects: async () => {
        const appUserId = event.app_user_id;
        // tier/status/entitlement/expiry decision is pure + unit-tested in revenueCatEvents.ts.
        const state = subscriptionStateFromRevenueCatEvent(event);

        await ctx.runMutation((internal as any).payments.updateByRevenueCatAppUser, {
          revenueCatAppUserId: appUserId,
          tier: state.tier,
          status: state.status,
          entitlement: state.entitlement,
          expiresAt: state.expiresAt,
          eventAtMs: event.event_timestamp_ms,
        });

        // Recurring credit allowance on mobile: the RC analogue of Stripe's
        // invoice.paid. Grants the plan's per-cycle credits on INITIAL_PURCHASE and
        // RENEWAL; event.id keys the grant so one deposit per period.
        const creditGrant = creditGrantFromRevenueCatEvent(event);
        if (creditGrant) {
          await ctx.runMutation((internal as any).payments.credits.grantSubscriptionCredits, {
            revenueCatAppUserId: creditGrant.appUserId,
            credits: creditGrant.credits,
            idempotencyKey: event.id,
            reason: `RevenueCat subscription credits (${event.product_id})`,
          });
        }
      },
      recordEvent: async () => {
        await ctx.runMutation((internal as any).payments.logPaymentEvent, {
          source: "revenuecat" as const,
          eventType: event.type,
          eventId: event.id,
          payload: JSON.stringify(body),
        });
      },
    });

    if (outcome === "duplicate") {
      return new Response("Already processed", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("RevenueCat webhook handler failed", err);
    return new Response("Handler error", { status: 500 });
  }
});

// Minimal type for the RC webhook payload (the fields we care about)
interface RCWebhookPayload {
  event: {
    id: string;
    type: string;
    app_user_id: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number;
    product_id?: string;
    event_timestamp_ms?: number;
  };
}
