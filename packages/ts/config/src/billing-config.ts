// Shared billing configuration. Imported by Convex actions, web client, and mobile client.
// The tier definitions, price IDs, and feature flags live here as the single source.
// When you add a tier or change a price, you only edit this file.
//
// ─── Billing is a MATRIX, not one fixed model. Pick yours by editing numbers here: ───
//   • Tiers only      → set every tier's `credits` to 0; lifetime = { tier: "pro" }.
//   • Credits only    → lower Free's aiMessagesPerDay; sell ONE_TIME_PRICES packs.
//   • Tiers + credits → give tiers `credits > 0` (the current default).
//   • Mixed per plan  → credits per tier AND per interval (Pro with, Ultra without).
// Caveat: an UNLIMITED tier (aiMessagesPerDay: -1) never spends credits — the
// limit check returns first. Credits only matter on tiers with a finite limit.
// ──────────────────────────────────────────────────────────────────────────────────

export type Tier = "free" | "pro" | "ultra";

// Product access is intentionally open while Looper is in its free launch
// period. Keep commercial configuration below so it can be enabled later, but
// callers must not expose or enforce plans, trials, or credits while this is on.
export const PRODUCT_ACCESS_IS_FREE = true;

export type SubscriptionStatus =
  | "active" // paid, valid
  | "trialing" // free trial
  | "past_due" // payment failed but grace period
  | "canceled" // explicit cancel, still active until expiresAt
  | "expired" // post-expiresAt
  | "none"; // never subscribed

export interface TierConfig {
  tier: Tier;
  name: string;
  description: string;
  // ⚠️ Display only — the UI shows this, but the CHARGE comes from the Stripe
  // price id below. They are decoupled: keep `displayPriceUsd` in sync with your
  // Stripe `monthly` price (and `displayPriceYearlyUsd` with `yearly`), or
  // customers will see one amount and be billed another.
  displayPriceUsd: number;
  // Total billed once per year (typically ~10× monthly = 2 months free). Shown
  // when the billing UI's period toggle is "yearly". MUST match your Stripe
  // `yearly` price amount (see the warning on displayPriceUsd).
  displayPriceYearlyUsd: number;
  stripe: {
    monthly: string;
    yearly: string;
  };
  // Polar product IDs. Polar is a Merchant of Record (handles tax/VAT).
  // Unlike Stripe (1 product → N prices), Polar models the recurring interval
  // PER PRODUCT, so monthly and yearly are two SEPARATE products. Create both at
  // polar.sh and paste their IDs here. Leave `yearly` "" to offer monthly only —
  // the billing UI hides the yearly toggle for Polar when no yearly product exists.
  polar: {
    monthly: string;
    yearly: string;
  };
  revenueCat: {
    monthly: string;
    yearly: string;
    entitlement: string;
  };
  // Consumable credits granted each billing cycle (on the initial purchase and
  // every renewal, via the Stripe `invoice.paid` webhook). Set 0 to grant none.
  credits: {
    monthly: number;
    yearly: number;
  };
  features: {
    maxWorkspaces: number; // -1 means unlimited
    maxMembersPerWorkspace: number;
    aiMessagesPerDay: number;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
  };
  // i18n keys for the feature bullets shown on the pricing page (web) and the
  // plans screen (mobile) — the single source of truth so both surfaces
  // advertise the same thing. Render sites resolve each key via t(key) so the
  // bullets are localized. Keep these honest: list only what the product
  // actually ships (Looper has no multi-seat/workspace system).
  marketingFeatures: readonly string[];
}

// Tier order matters: index = tier rank. A user on "ultra" satisfies any "tier >= pro" check.
export const TIERS: readonly TierConfig[] = [
  {
    tier: "free",
    name: "Free",
    description: "For personal dictation and transcription",
    displayPriceUsd: 0,
    displayPriceYearlyUsd: 0,
    stripe: { monthly: "", yearly: "" },
    polar: { monthly: "", yearly: "" },
    revenueCat: { monthly: "", yearly: "", entitlement: "" },
    credits: { monthly: 0, yearly: 0 },
    features: {
      maxWorkspaces: 1,
      maxMembersPerWorkspace: 1,
      aiMessagesPerDay: 10,
      advancedAnalytics: false,
      prioritySupport: false,
    },
    marketingFeatures: [
      "billing.feat.anonEmailLogin",
      "billing.feat.cloudAudioHistory",
      "billing.feat.messages10PerDay",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    description: "For frequent recording and transcript work",
    displayPriceUsd: 10,
    displayPriceYearlyUsd: 100,
    stripe: {
      monthly: "price_REPLACE_pro_monthly",
      yearly: "price_REPLACE_pro_yearly",
    },
    polar: {
      monthly: "REPLACE_WITH_POLAR_PRO_MONTHLY_PRODUCT_ID",
      yearly: "REPLACE_WITH_POLAR_PRO_YEARLY_PRODUCT_ID",
    },
    revenueCat: {
      // RC *product identifiers* (NOT the entitlement). Must match the product
      // ids your RevenueCat offering uses — the subscription-credit grant keys
      // off these.
      monthly: "REPLACE_WITH_REVENUECAT_PRO_MONTHLY_PRODUCT_ID",
      yearly: "REPLACE_WITH_REVENUECAT_PRO_YEARLY_PRODUCT_ID",
      entitlement: "REPLACE_WITH_REVENUECAT_PRO_ENTITLEMENT_ID",
    },
    credits: { monthly: 100, yearly: 1200 },
    features: {
      maxWorkspaces: 5,
      maxMembersPerWorkspace: 10,
      aiMessagesPerDay: 100,
      advancedAnalytics: true,
      prioritySupport: false,
    },
    marketingFeatures: [
      "billing.feat.messages100PerDay",
      "billing.feat.syncedTranscriptMemory",
      "billing.feat.audioUsageMetrics",
    ],
  },
  {
    tier: "ultra",
    name: "Ultra",
    description: "For high-volume audio workflows",
    displayPriceUsd: 30,
    displayPriceYearlyUsd: 300,
    stripe: {
      monthly: "price_REPLACE_ultra_monthly",
      yearly: "price_REPLACE_ultra_yearly",
    },
    polar: {
      monthly: "REPLACE_WITH_POLAR_ULTRA_MONTHLY_PRODUCT_ID",
      yearly: "REPLACE_WITH_POLAR_ULTRA_YEARLY_PRODUCT_ID",
    },
    revenueCat: {
      monthly: "REPLACE_WITH_REVENUECAT_ULTRA_MONTHLY_PRODUCT_ID",
      yearly: "REPLACE_WITH_REVENUECAT_ULTRA_YEARLY_PRODUCT_ID",
      entitlement: "REPLACE_WITH_REVENUECAT_ULTRA_ENTITLEMENT_ID",
    },
    credits: { monthly: 500, yearly: 6000 },
    features: {
      maxWorkspaces: -1,
      maxMembersPerWorkspace: -1,
      aiMessagesPerDay: -1,
      advancedAnalytics: true,
      prioritySupport: true,
    },
    marketingFeatures: [
      "billing.feat.unlimitedMessages",
      "billing.feat.prioritySupport",
      "billing.feat.customIntegrations",
    ],
  },
] as const;

export function getTierConfig(tier: Tier): TierConfig {
  const found = TIERS.find((t) => t.tier === tier);
  if (!found) throw new Error(`Unknown tier: ${tier}`);
  return found;
}

export type BillingInterval = "monthly" | "yearly";

export interface StripePriceOverrides {
  pro?: Partial<Record<BillingInterval, string>>;
  ultra?: Partial<Record<BillingInterval, string>>;
  oneTime?: Partial<Record<OneTimePack, string>>;
}

export function isConfiguredBillingId(id: string | undefined): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    !id.startsWith("price_REPLACE_") &&
    !id.startsWith("REPLACE_")
  );
}

export function resolveStripeTierPriceId(
  tier: Exclude<Tier, "free">,
  interval: BillingInterval,
  overrides: StripePriceOverrides = {},
): string {
  return overrides[tier]?.[interval] ?? getTierConfig(tier).stripe[interval];
}

// One-time purchase price IDs (credit packs, lifetime deals).
//
// 👉 REPLACE these with YOUR Stripe one-time Price IDs before shipping:
//    Stripe Dashboard → Products → create a product → add a price → "One time"
//    → copy the `price_…` id here. Set the matching credit amount in
//    ONE_TIME_CREDITS below, and run `/integration stripe` for the walkthrough.
//
// These placeholders keep checkout disabled until the operator supplies account-
// specific IDs. `getOneTimePriceId` rejects placeholders, and the UI hides
// unconfigured packs. `createOneTimeCheckout` resolves IDs server-side from a
// `pack` key, so a client can never pass an arbitrary price.
export const ONE_TIME_PRICES = {
  credits_100: "price_REPLACE_credits_100",
  credits_500: "price_REPLACE_credits_500",
  // Lifetime: a one-time payment for PERMANENT access (no recurring billing).
  lifetime: "price_REPLACE_lifetime",
} as const;

export type OneTimePack = keyof typeof ONE_TIME_PRICES;

export function resolveStripeOneTimePriceId(
  pack: OneTimePack,
  overrides: StripePriceOverrides = {},
): string {
  return overrides.oneTime?.[pack] ?? ONE_TIME_PRICES[pack];
}

export function getOneTimePriceId(pack: OneTimePack): string {
  const id = resolveStripeOneTimePriceId(pack);
  if (!isConfiguredBillingId(id)) {
    throw new Error(
      `Stripe price for "${pack}" is not configured. Edit ONE_TIME_PRICES in billing-config.ts.`,
    );
  }
  return id;
}

// What each one-time purchase grants. A pack can deposit consumable `credits`
// (top-up), grant a permanent `tier` (lifetime — pay once, no recurring billing),
// or both. The webhook applies this on a successful one-time purchase. Keep the
// keys in sync with ONE_TIME_PRICES.
export const ONE_TIME_GRANTS: Record<OneTimePack, { credits?: number; tier?: Tier }> = {
  credits_100: { credits: 100 },
  credits_500: { credits: 500 },
  // Lifetime: permanent Pro tier (no expiry) + a one-time credit stash.
  lifetime: { tier: "pro", credits: 10_000 },
};

export function oneTimeGrant(pack: OneTimePack): { credits?: number; tier?: Tier } {
  return ONE_TIME_GRANTS[pack] ?? {};
}

// Credits granted per billing cycle for a subscription, resolved from the Stripe
// price id. Used by the `invoice.paid` webhook (fires on the initial charge and
// every renewal), so a Pro-monthly subscriber gets `credits.monthly` each month
// and a Pro-yearly subscriber gets `credits.yearly` each year.
export function subscriptionCreditsForStripePrice(
  priceId: string,
  overrides: StripePriceOverrides = {},
): number {
  for (const t of TIERS) {
    if (t.tier === "free") continue;
    if (resolveStripeTierPriceId(t.tier, "monthly", overrides) === priceId) {
      return t.credits.monthly;
    }
    if (resolveStripeTierPriceId(t.tier, "yearly", overrides) === priceId) {
      return t.credits.yearly;
    }
  }
  return 0;
}

// RevenueCat analogue: per-cycle credits resolved from the RC product id (set on
// each tier's `revenueCat.monthly` / `revenueCat.yearly`). Used by the RC webhook
// to grant the same subscription credit allowance on mobile as Stripe does on web.
export function subscriptionCreditsForRevenueCatProduct(productId: string): number {
  for (const t of TIERS) {
    if (t.revenueCat.monthly === productId) return t.credits.monthly;
    if (t.revenueCat.yearly === productId) return t.credits.yearly;
  }
  return 0;
}

// Polar credits, resolved from the per-tier product id (monthly OR yearly). Polar's
// Convex component exposes no renewal/order callback, so this is granted ONCE on
// subscription creation — the monthly product grants the monthly allowance, the
// yearly product the yearly allowance. Recurring Polar credits would still need a
// raw Polar order webhook. See payments/polarEvents.ts.
export function subscriptionCreditsForPolarProduct(productId: string): number {
  for (const t of TIERS) {
    if (t.polar.monthly === productId) return t.credits.monthly;
    if (t.polar.yearly === productId) return t.credits.yearly;
  }
  return 0;
}

// Rank comparison: "ultra" >= "pro" >= "free". Returns true if `actual` satisfies `required`.
export function tierSatisfies(actual: Tier, required: Tier): boolean {
  const ranks: Record<Tier, number> = { free: 0, pro: 1, ultra: 2 };
  return ranks[actual] >= ranks[required];
}

// Resolve a Stripe Price ID back to a tier (used by webhook to update users.subscription)
export function tierFromStripePriceId(
  priceId: string,
  overrides: StripePriceOverrides = {},
): Tier | null {
  for (const t of TIERS) {
    if (t.tier === "free") continue;
    if (
      resolveStripeTierPriceId(t.tier, "monthly", overrides) === priceId ||
      resolveStripeTierPriceId(t.tier, "yearly", overrides) === priceId
    ) {
      return t.tier;
    }
  }
  return null;
}

// Resolve a Polar product ID (monthly or yearly) back to a tier
export function tierFromPolarProductId(productId: string): Tier | null {
  for (const t of TIERS) {
    if (t.polar.monthly === productId || t.polar.yearly === productId) return t.tier;
  }
  return null;
}

// Resolve a RevenueCat entitlement ID to a tier.
// 1. Exact match against the configured entitlement ids (billing-config).
// 2. Fallback: case-insensitive tier-name match, so a dashboard entitlement that
//    wasn't pasted into config — e.g. "MyApp Pro", "Acme Ultra" — still resolves to
//    the right tier instead of being lost. This keeps the Ultra tier reachable via
//    RevenueCat even when the entitlement id differs from the literal "ultra".
export function tierFromRevenueCatEntitlement(entitlement: string): Tier | null {
  for (const t of TIERS) {
    if (t.revenueCat.entitlement && t.revenueCat.entitlement === entitlement) {
      return t.tier;
    }
  }
  const lower = entitlement.toLowerCase();
  if (lower.includes("ultra")) return "ultra";
  if (lower.includes("pro")) return "pro";
  return null;
}
