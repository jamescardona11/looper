// Convex adapter — billing domain hooks.
//
// useSubscription / useTier / useHasTier / useCheckout /
// usePolarCheckout / usePurchaseSync.
//
// Every optional-feature hook (subscription, payments) calls the
// underlying useQuery/useAction/useMutation UNCONDITIONALLY and feeds a `SKIP`
// sentinel (or an unconditionally-resolved ref) when the feature is absent.
// Defaults are exposed instead of nullable hooks: `balance: null`
// for credits, a fully-defaulted free/none/loading state for subscription, and
// an `available` flag for Polar/Stripe checkout.
//
// Id<> brands are stripped at the boundary: all ids are plain `string` in the
// signatures; the `as any` casts live inside this adapter.

import { api } from "@looper/backend/convex/_generated/api";
import { type Tier, tierSatisfies } from "@looper/config/billing";
import { useAction, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import type {
  CheckoutInput,
  CheckoutResult,
  OneTimeCheckoutInput,
  PolarCheckoutInput,
  PortalInput,
  SubscriptionState,
} from "../../../types";

// ── useSubscription ─────────────────────────────────────────────────────────
// Returns a fully-defaulted free/none/loading state while the query resolves.
export function useSubscription(): SubscriptionState {
  const data = useQuery(api.payments.subscription.mySubscription);

  if (data === undefined) {
    return {
      tier: "free",
      status: "none",
      source: null,
      expiresAt: null,
      isLoading: true,
    };
  }
  return {
    ...(data as Omit<SubscriptionState, "isLoading">),
    isLoading: false,
  };
}

// ── useTier ─────────────────────────────────────────────────────────────────
// Thin selector over useSubscription().tier.
export function useTier(): Tier {
  return useSubscription().tier;
}

// ── useHasTier ──────────────────────────────────────────────────────────────
// tierSatisfies stays in @looper/config/billing (config-package, not
// backend) so it's adapter-agnostic.
export function useHasTier(required: Tier): boolean {
  const { tier } = useSubscription();
  return tierSatisfies(tier, required);
}

// ── useCheckout (web) ─────────────────────────────────────────────────────────
// Stripe checkout/portal. Returns { url }; the redirect (Tauri openExternal vs
// window.location) stays at the call-site, NOT in the hook. Local isUpgrading /
// error state belongs in the hook. The actions are resolved unconditionally so
// the hooks stay Rules-of-Hooks safe even when Stripe is unconfigured.
export function useCheckout(): {
  upgrade: (input: CheckoutInput) => Promise<CheckoutResult>;
  openPortal: (input: PortalInput) => Promise<CheckoutResult>;
  isUpgrading: boolean;
  error: string | null;
} {
  const createSession = useAction(api.payments.stripe.createCheckoutSession);
  const createPortal = useAction(api.payments.stripe.createPortalSession);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upgrade = useCallback(
    async (input: CheckoutInput): Promise<CheckoutResult> => {
      setIsUpgrading(true);
      setError(null);
      try {
        return (await createSession(input as any)) as CheckoutResult;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed");
        setIsUpgrading(false);
        throw err;
      }
    },
    [createSession],
  );

  const openPortal = useCallback(
    async (input: PortalInput): Promise<CheckoutResult> => {
      setIsUpgrading(true);
      setError(null);
      try {
        return (await createPortal(input as any)) as CheckoutResult;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Portal failed");
        setIsUpgrading(false);
        throw err;
      }
    },
    [createPortal],
  );

  return { upgrade, openPortal, isUpgrading, error };
}

// ── usePolarCheckout (web) ────────────────────────────────────────────────────
// billing.tsx resolves polarApi/stripeApi via (api as any).payments?.polar /
// ?.stripe — paths absent when Polar/Stripe unconfigured. Expose an `available`
// flag instead of nullable functions. createOneTimeCheckout (credit packs) lives
// under stripe but groups with the billing-route surface. Actions resolve
// unconditionally; `available` is true only when the Polar module exists.
export function usePolarCheckout(): {
  createCheckout: (input: PolarCheckoutInput) => Promise<CheckoutResult>;
  openPortal: (input: PortalInput) => Promise<CheckoutResult>;
  createOneTimeCheckout: (
    input: OneTimeCheckoutInput,
  ) => Promise<CheckoutResult>;
  available: boolean;
} {
  const createCheckoutAction = useAction(api.payments.polar.createCheckout);
  const customerPortalAction = useAction(api.payments.polar.customerPortal);
  const oneTimeAction = useAction(api.payments.stripe.createOneTimeCheckout);

  const createCheckout = useCallback(
    async (input: PolarCheckoutInput): Promise<CheckoutResult> =>
      (await createCheckoutAction(input as any)) as CheckoutResult,
    [createCheckoutAction],
  );

  const openPortal = useCallback(
    async (input: PortalInput): Promise<CheckoutResult> =>
      (await customerPortalAction(input as any)) as CheckoutResult,
    [customerPortalAction],
  );

  const createOneTimeCheckout = useCallback(
    async (input: OneTimeCheckoutInput): Promise<CheckoutResult> =>
      (await oneTimeAction(input as any)) as CheckoutResult,
    [oneTimeAction],
  );

  return { createCheckout, openPortal, createOneTimeCheckout, available: true };
}

// ── usePurchaseSync (mobile) ──────────────────────────────────────────────────
// RevenueCat → Convex. Reads the generated users.me reference to derive
// appUserId, then syncRevenueCatPurchase({ appUserId }). Early-returns if
// !appUserId.
export function usePurchaseSync(): {
  sync: () => Promise<void>;
  appUserId: string | null;
} {
  const me = useQuery(api.users.me);
  const appUserId = ((me as { _id?: string } | null | undefined)?._id ??
    null) as string | null;
  const syncAction = useAction(api.payments.revenueCat.syncRevenueCatPurchase);

  const sync = useCallback(async (): Promise<void> => {
    if (!appUserId) return;
    await syncAction({ appUserId });
  }, [syncAction, appUserId]);

  return { sync, appUserId };
}
