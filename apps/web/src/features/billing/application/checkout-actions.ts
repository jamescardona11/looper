// CheckoutActions seam — the provider boundary for billing checkout.
//
// Stripe and Polar expose different domain hooks in @looper/data; this
// module folds them behind one interface so the busy/error/redirect cycle is
// written exactly once instead of per provider branch:
//
//   gateways (data hooks) → buildCheckoutAdapters → CheckoutActions (per provider)
//   CheckoutActions + runCheckoutCycle → buildBillingOperations → page-facing ops
//
// Everything here is pure wiring over injected functions — tests stub the
// gateways and the cycle IO directly, no module mocking needed. The React
// state + real data hooks are bound in hooks/use-billing-actions.ts.

import type { OneTimePack, Tier } from "@looper/config/billing";
import { openExternal } from "@/lib/desktop-host";

export type PaymentProvider = "stripe" | "polar";
export type BillingInterval = "monthly" | "yearly";

export interface CheckoutSession {
  url: string;
}

// One in-flight billing operation; null means idle. A single discriminated
// value replaces the old per-provider/per-operation flag spread
// (isUpgrading / isPolarUpgrading / portalBusy / buyingPack).
export type BillingBusy =
  | { kind: "upgrade" }
  | { kind: "portal" }
  | { kind: "credits"; pack: OneTimePack };

// What a payment provider must offer the billing page. Adapters create the
// hosted session and return its URL; navigation is the shared cycle's job.
export interface CheckoutActions {
  createUpgradeSession: (tier: Tier, interval: BillingInterval) => Promise<CheckoutSession>;
  createPortalSession: () => Promise<CheckoutSession>;
}

// Structural views of the @looper/data domain hooks, so adapters (and test
// stubs) depend on the shape, not the package.
export interface StripeCheckoutGateway {
  createSession: (input: {
    tier: "pro" | "ultra";
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<CheckoutSession>;
  createPortal: (input: { returnUrl: string }) => Promise<CheckoutSession>;
}

export interface PolarCheckoutGateway {
  createCheckout: (input: { productKey: string; successUrl: string }) => Promise<CheckoutSession>;
  openPortal: (input: { returnUrl: string }) => Promise<CheckoutSession>;
}

// Send the user to an external billing URL. On desktop (Tauri) this opens the
// system browser; on web it navigates the tab. Navigating the Tauri webview
// directly to Stripe/Polar would hang on a blank page — every billing redirect
// (upgrade, portal, credits) MUST go through here.
export async function goToBillingUrl(url: string): Promise<void> {
  if (!(await openExternal(url))) window.location.href = url;
}

export function buildCheckoutAdapters(gateways: {
  stripe: StripeCheckoutGateway;
  polar: PolarCheckoutGateway;
}): Record<PaymentProvider, CheckoutActions> {
  return {
    stripe: {
      // The page never offers upgrade on the free tier; Stripe's input narrows it.
      createUpgradeSession: (tier, interval) =>
        gateways.stripe.createSession({
          tier: tier as "pro" | "ultra",
          interval,
          successUrl: `${window.location.origin}/billing?status=success`,
          cancelUrl: `${window.location.origin}/billing?status=cancelled`,
        }),
      createPortalSession: () =>
        gateways.stripe.createPortal({ returnUrl: `${window.location.origin}/billing` }),
    },
    polar: {
      createUpgradeSession: (tier, interval) =>
        gateways.polar.createCheckout({
          productKey: interval === "yearly" ? `${tier}_yearly` : tier,
          successUrl: window.location.href,
        }),
      createPortalSession: () => gateways.polar.openPortal({ returnUrl: window.location.href }),
    },
  };
}

// Side-effect ports the cycle writes to — bound to React state and
// goToBillingUrl in the hook, to plain spies in tests.
export interface CheckoutCycleIo {
  navigate: (url: string) => Promise<void>;
  setBusy: (busy: BillingBusy | null) => void;
  setError: (message: string | null) => void;
  toErrorMessage: (error: unknown, fallback: string) => string;
}

// The single busy → create session → navigate → report-error cycle.
// On success `busy` intentionally stays set: the page is being navigated away
// and clearing it would re-enable the buttons during the redirect.
export async function runCheckoutCycle(
  io: CheckoutCycleIo,
  operation: BillingBusy,
  fallbackMessage: string,
  createSession: () => Promise<CheckoutSession>,
): Promise<void> {
  io.setBusy(operation);
  io.setError(null);
  try {
    const { url } = await createSession();
    await io.navigate(url);
  } catch (error) {
    io.setError(io.toErrorMessage(error, fallbackMessage));
    io.setBusy(null);
  }
}

export interface BillingMessages {
  checkoutFailed: string;
  portalFailed: string;
  creditsFailed: string;
}

// Compose the selected provider's CheckoutActions (plus the provider-independent
// credit packs, which are always Stripe one-time checkout) into the operations
// the billing page calls. Every operation runs through the same cycle and the
// same navigate seam.
export function buildBillingOperations(deps: {
  actions: CheckoutActions;
  createOneTimeSession: (input: {
    pack: OneTimePack;
    successUrl: string;
    cancelUrl: string;
  }) => Promise<CheckoutSession>;
  interval: BillingInterval;
  messages: BillingMessages;
  io: CheckoutCycleIo;
}): {
  upgrade: (tier: Tier) => Promise<void>;
  openPortal: () => Promise<void>;
  buyCredits: (pack: OneTimePack) => Promise<void>;
} {
  const { actions, createOneTimeSession, interval, messages, io } = deps;
  return {
    upgrade: (tier) =>
      runCheckoutCycle(io, { kind: "upgrade" }, messages.checkoutFailed, () =>
        actions.createUpgradeSession(tier, interval),
      ),
    openPortal: () =>
      runCheckoutCycle(io, { kind: "portal" }, messages.portalFailed, () =>
        actions.createPortalSession(),
      ),
    buyCredits: (pack) =>
      runCheckoutCycle(io, { kind: "credits", pack }, messages.creditsFailed, () =>
        createOneTimeSession({
          pack,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      ),
  };
}
