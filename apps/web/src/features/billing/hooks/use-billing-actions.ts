// React binding for the CheckoutActions seam (see application/checkout-actions.ts).
//
// Owns the provider-availability flags (derived from configured price ids) and
// the single busy/error state the billing page renders. Provider selection is
// just indexing into the adapter map — no per-provider branches or parallel
// state here.

import {
  isConfiguredBillingId,
  PRODUCT_ACCESS_IS_FREE,
  type OneTimePack,
  resolveStripeOneTimePriceId,
  resolveStripeTierPriceId,
  TIERS,
  type Tier,
} from "@looper/config/billing";
import { useCheckout, usePolarCheckout } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useMemo, useState } from "react";
import { env } from "@/env";
import { reportError } from "@/lib/errors";
import {
  type BillingBusy,
  type BillingInterval,
  buildBillingOperations,
  buildCheckoutAdapters,
  goToBillingUrl,
  type PaymentProvider,
} from "../application/checkout-actions";

export type { BillingBusy, PaymentProvider } from "../application/checkout-actions";

const stripePriceOverrides = {
  pro: {
    monthly: env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID,
    yearly: env.VITE_STRIPE_PRO_YEARLY_PRICE_ID,
  },
  ultra: {
    monthly: env.VITE_STRIPE_ULTRA_MONTHLY_PRICE_ID,
    yearly: env.VITE_STRIPE_ULTRA_YEARLY_PRICE_ID,
  },
  oneTime: {
    credits_100: env.VITE_STRIPE_CREDITS_100_PRICE_ID,
    credits_500: env.VITE_STRIPE_CREDITS_500_PRICE_ID,
    lifetime: env.VITE_STRIPE_LIFETIME_PRICE_ID,
  },
};

const STRIPE_ENABLED = (["pro", "ultra"] as const).some((tier) =>
  isConfiguredBillingId(resolveStripeTierPriceId(tier, "monthly", stripePriceOverrides)),
);
const POLAR_ENABLED = TIERS.some((tier) => isConfiguredBillingId(tier.polar.monthly));
const POLAR_YEARLY_ENABLED = TIERS.some((tier) => isConfiguredBillingId(tier.polar.yearly));
export const BILLING_ENABLED = !PRODUCT_ACCESS_IS_FREE && (STRIPE_ENABLED || POLAR_ENABLED);
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = STRIPE_ENABLED ? "stripe" : "polar";
export const SHOW_PAYMENT_PROVIDER_TOGGLE = STRIPE_ENABLED && POLAR_ENABLED;
export const CREDIT_PACKS_ENABLED =
  !PRODUCT_ACCESS_IS_FREE &&
  (["credits_100", "credits_500", "lifetime"] as const).some((pack) =>
    isConfiguredBillingId(resolveStripeOneTimePriceId(pack, stripePriceOverrides)),
  );

export function paymentProviderSupportsYearly(provider: PaymentProvider): boolean {
  return provider === "stripe" || POLAR_YEARLY_ENABLED;
}

export function useBillingActions(
  provider: PaymentProvider,
  interval: BillingInterval,
): {
  upgrade: (tier: Tier) => Promise<void>;
  openPortal: () => Promise<void>;
  buyCredits: (pack: OneTimePack) => Promise<void>;
  busy: BillingBusy | null;
  error: string | null;
} {
  const { t } = useTranslation();
  const { upgrade: createStripeSession, openPortal: createStripePortal } = useCheckout();
  const {
    createCheckout: createPolarSession,
    openPortal: createPolarPortal,
    createOneTimeCheckout,
  } = usePolarCheckout();
  const [busy, setBusy] = useState<BillingBusy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const operations = useMemo(() => {
    const adapters = buildCheckoutAdapters({
      stripe: { createSession: createStripeSession, createPortal: createStripePortal },
      polar: { createCheckout: createPolarSession, openPortal: createPolarPortal },
    });
    return buildBillingOperations({
      actions: adapters[provider],
      createOneTimeSession: createOneTimeCheckout,
      interval,
      messages: {
        checkoutFailed: t("billing.checkoutFailed"),
        portalFailed: t("billing.portalFailed"),
        creditsFailed: t("billing.checkoutStartFailed"),
      },
      io: {
        navigate: goToBillingUrl,
        setBusy,
        setError,
        toErrorMessage: (err, fallback) => reportError(err, fallback),
      },
    });
  }, [
    provider,
    interval,
    t,
    createStripeSession,
    createStripePortal,
    createPolarSession,
    createPolarPortal,
    createOneTimeCheckout,
  ]);

  return { ...operations, busy, error };
}
