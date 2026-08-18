# Billing & tokens — domain glossary

Vocabulary for the billing/tokens subsystem, so architecture reviews and AI
navigation share names. The operator-maintained configuration lives in
`packages/ts/config/src/billing-config.ts`.

## Domain terms

- **Tier** — `free | pro | ultra`. A rank (`tierSatisfies`: ultra ≥ pro ≥ free).
  Defined once in `packages/ts/config/src/billing-config.ts` (`TIERS`).
- **Subscription** — one `userSubscriptions` row per user (per-user by design — no multi-tenancy).
  Holds the active `source` (stripe/polar/revenuecat/manual) + that provider's
  ids + lifecycle (tier, status, expiresAt) + the **permanent** flag.
- **Provider** — Stripe / Polar / RevenueCat. Each maps its own external key to a
  Tier (price id / product id / entitlement). Mobile uses RevenueCat (App Store
  policy); web uses Stripe and/or Polar.
- **Permanent (lifetime)** — a one-time purchase that pins the subscription row:
  recurring webhook events cannot downgrade or expire it. Enforced by the
  permanence guard in `commitSubscription`.
- **Credit ledger** — consumable balance (`creditBalance` + `creditTransactions`),
  in `payments/credits.ts`. Idempotent grants/deductions.
- **Subscription credits** — the per-period allowance a paid tier grants on each
  cycle invoice. Distinct from the daily message limit.
- **Message spend** — consuming one message's worth of allowance: a daily rate
  limiter token, falling back to one credit (overflow) when the tier limit is
  hit. Lives in `agent/credits.ts` `assertWithinLimit`. Authoritative spend
  happens once per turn (the call carrying a `consumeCreditKey`).
- **Usage / cost** — per-message token counts + estimated $ cost in `agentUsage`.

## Seams (where behaviour can be altered without editing in place)

- **`payments/stripeEvents.ts`** — the pure decisions behind the Stripe webhook,
  so each is the test surface (no Stripe events needed). The webhook is a thin
  adapter: verify → fetch existing subscription → call these → apply effects.
  - `creditGrantFromInvoice(invoice)` — does `invoice.paid` grant credits, to whom?
    (proration/upgrade invoices must NOT grant — bug #1).
  - `subscriptionStateFromStripeSub(sub)` — `subscription.created/updated` → stored
    tier/status/expiry (status collapse, price→tier, cancel_at→expiry).
  - `oneTimeCheckoutPlan(metadata, existing)` — one-time checkout → lifetime tier
    (no-downgrade), cancel-recurring-sub decision, credits. Existing state is
    injected, so the no-downgrade is pure. All tested in `stripeEvents.test.ts`.
- **`payments/revenueCatEvents.ts`** — the RC analogue of stripeEvents:
  `creditGrantFromRevenueCatEvent(event)` decides the per-cycle credit grant on
  INITIAL_PURCHASE / RENEWAL (product id → credits). The RC webhook applies it
  via `grantSubscriptionCredits({ revenueCatAppUserId })`. So mobile subscribers
  get the same credit allowance as web. Tested in `revenueCatEvents.test.ts`.
- **`payments/polarEvents.ts`** — `initialCreditGrantFromPolarSubscription(sub)`
  grants the allowance ONCE on Polar subscription creation (idempotent by sub id).
  ⚠️ Polar's Convex component exposes no renewal/order callback, so Polar credits
  are **initial-only by design** — recurring would need a raw Polar `order.paid`
  webhook. Stripe (invoice.paid) and RevenueCat (RENEWAL) do grant recurring.
  Wired in `http.ts` onSubscriptionCreated. Tested in `polarEvents.test.ts`.
- **`logUsage`** (`agent/usage.ts`) — owns cost. Callers report raw token counts
  + the model id; the module derives `estimatedCostUsd` from the model's rates.
  A caller cannot record a wrong/zero cost.
- **`commitSubscription`** (`payments.ts`) — single write path for all providers;
  out-of-order guard (`lastEventAt`) + permanence guard live here.
- **`applyPaymentEvent`** (`payments/applyEvent.ts`) — owns the webhook application
  order shared by Providers: idempotency check → effects → append-only audit log.
  Failed effects are never recorded as processed, so Provider retries remain safe.

## Known shallow-but-necessary

The `tierFrom*` / `getTierConfig` / `subscriptionCreditsForStripePrice` helpers in
`billing-config.ts` are thin accessors over `TIERS`. They are accessors, not a
deep module — the real configuration weight is the `TIERS` array itself. Don't
"deepen" them into a provider-dispatch facade (the keys differ per provider).
