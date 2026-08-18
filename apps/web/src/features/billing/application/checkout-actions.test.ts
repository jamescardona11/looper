// Tests for the CheckoutActions seam: the shared busy/error/navigate cycle,
// the per-provider adapters, and the operation composition. Everything is
// exercised through injected stubs — no module mocks, no React.

import { describe, expect, it, vi } from "vitest";
import {
  type BillingBusy,
  buildBillingOperations,
  buildCheckoutAdapters,
  type CheckoutCycleIo,
  type CheckoutSession,
  type PolarCheckoutGateway,
  runCheckoutCycle,
  type StripeCheckoutGateway,
} from "./checkout-actions";

function makeIo() {
  return {
    navigate: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    setBusy: vi.fn<(busy: BillingBusy | null) => void>(),
    setError: vi.fn<(message: string | null) => void>(),
    toErrorMessage: vi.fn((_err: unknown, fallback: string) => `friendly: ${fallback}`),
  } satisfies CheckoutCycleIo;
}

function makeGateways() {
  const stripe = {
    createSession: vi
      .fn<StripeCheckoutGateway["createSession"]>()
      .mockResolvedValue({ url: "https://stripe.example/checkout" }),
    createPortal: vi
      .fn<StripeCheckoutGateway["createPortal"]>()
      .mockResolvedValue({ url: "https://stripe.example/portal" }),
  };
  const polar = {
    createCheckout: vi
      .fn<PolarCheckoutGateway["createCheckout"]>()
      .mockResolvedValue({ url: "https://polar.example/checkout" }),
    openPortal: vi
      .fn<PolarCheckoutGateway["openPortal"]>()
      .mockResolvedValue({ url: "https://polar.example/portal" }),
  };
  return { stripe, polar };
}

const messages = {
  checkoutFailed: "checkout failed",
  portalFailed: "portal failed",
  creditsFailed: "credits failed",
};

describe("runCheckoutCycle", () => {
  it("activates busy during the operation and navigates via the injected seam on success", async () => {
    const io = makeIo();
    let resolveSession!: (session: CheckoutSession) => void;
    const createSession = vi.fn(
      () => new Promise<CheckoutSession>((resolve) => (resolveSession = resolve)),
    );

    const cycle = runCheckoutCycle(io, { kind: "portal" }, "fallback", createSession);

    // Busy is on and the previous error cleared while the session is pending.
    expect(io.setBusy).toHaveBeenCalledWith({ kind: "portal" });
    expect(io.setError).toHaveBeenCalledWith(null);
    expect(io.navigate).not.toHaveBeenCalled();

    resolveSession({ url: "https://pay.example/session" });
    await cycle;

    expect(io.navigate).toHaveBeenCalledWith("https://pay.example/session");
    // Busy stays set through the redirect — it must never flip back on success.
    expect(io.setBusy).not.toHaveBeenCalledWith(null);
  });

  it("reports the error and clears busy on failure, without navigating", async () => {
    const io = makeIo();
    const boom = new Error("declined");

    await runCheckoutCycle(io, { kind: "upgrade" }, "fallback msg", () => Promise.reject(boom));

    expect(io.toErrorMessage).toHaveBeenCalledWith(boom, "fallback msg");
    expect(io.setError).toHaveBeenLastCalledWith("friendly: fallback msg");
    expect(io.setBusy).toHaveBeenLastCalledWith(null);
    expect(io.navigate).not.toHaveBeenCalled();
  });
});

describe("openPortal redirect regression (Tauri hang)", () => {
  // The old use-checkout.ts navigated the portal with a direct
  // `window.location.href = url` while upgrade went through goToBillingUrl —
  // hanging the Tauri webview. Both must use the SAME injected navigate seam.
  it.each([
    "stripe",
    "polar",
  ] as const)("%s portal navigates through the same seam as upgrade, never window.location.href", async (provider) => {
    const io = makeIo();
    const adapters = buildCheckoutAdapters(makeGateways());
    const operations = buildBillingOperations({
      actions: adapters[provider],
      createOneTimeSession: vi.fn().mockResolvedValue({ url: "https://stripe.example/packs" }),
      interval: "monthly",
      messages,
      io,
    });
    const hrefBefore = window.location.href;

    await operations.openPortal();
    await operations.upgrade("pro");

    expect(io.navigate).toHaveBeenNthCalledWith(1, `https://${provider}.example/portal`);
    expect(io.navigate).toHaveBeenNthCalledWith(2, `https://${provider}.example/checkout`);
    expect(window.location.href).toBe(hrefBefore);
  });
});

describe("adapter selection and shape", () => {
  it("routes upgrade and portal to the gateway of the selected provider only", async () => {
    const io = makeIo();
    const gateways = makeGateways();
    const adapters = buildCheckoutAdapters(gateways);

    const stripeOps = buildBillingOperations({
      actions: adapters.stripe,
      createOneTimeSession: vi.fn().mockResolvedValue({ url: "https://x" }),
      interval: "monthly",
      messages,
      io,
    });
    await stripeOps.upgrade("pro");
    await stripeOps.openPortal();
    expect(gateways.stripe.createSession).toHaveBeenCalledTimes(1);
    expect(gateways.stripe.createPortal).toHaveBeenCalledTimes(1);
    expect(gateways.polar.createCheckout).not.toHaveBeenCalled();
    expect(gateways.polar.openPortal).not.toHaveBeenCalled();

    const polarOps = buildBillingOperations({
      actions: adapters.polar,
      createOneTimeSession: vi.fn().mockResolvedValue({ url: "https://x" }),
      interval: "monthly",
      messages,
      io,
    });
    await polarOps.upgrade("pro");
    await polarOps.openPortal();
    expect(gateways.polar.createCheckout).toHaveBeenCalledTimes(1);
    expect(gateways.polar.openPortal).toHaveBeenCalledTimes(1);
    expect(gateways.stripe.createSession).toHaveBeenCalledTimes(1);
  });

  it("maps tier and interval into each provider's checkout input", async () => {
    const gateways = makeGateways();
    const adapters = buildCheckoutAdapters(gateways);

    await adapters.stripe.createUpgradeSession("ultra", "yearly");
    expect(gateways.stripe.createSession).toHaveBeenCalledWith({
      tier: "ultra",
      interval: "yearly",
      successUrl: `${window.location.origin}/billing?status=success`,
      cancelUrl: `${window.location.origin}/billing?status=cancelled`,
    });

    await adapters.polar.createUpgradeSession("pro", "yearly");
    expect(gateways.polar.createCheckout).toHaveBeenCalledWith({
      productKey: "pro_yearly",
      successUrl: window.location.href,
    });

    await adapters.polar.createUpgradeSession("pro", "monthly");
    expect(gateways.polar.createCheckout).toHaveBeenLastCalledWith({
      productKey: "pro",
      successUrl: window.location.href,
    });
  });
});

describe("buyCredits", () => {
  it("runs through the same cycle: per-pack busy, navigate on success", async () => {
    const io = makeIo();
    const createOneTimeSession = vi.fn().mockResolvedValue({ url: "https://stripe.example/packs" });
    const operations = buildBillingOperations({
      actions: buildCheckoutAdapters(makeGateways()).stripe,
      createOneTimeSession,
      interval: "monthly",
      messages,
      io,
    });

    await operations.buyCredits("credits_100");

    expect(io.setBusy).toHaveBeenCalledWith({ kind: "credits", pack: "credits_100" });
    expect(createOneTimeSession).toHaveBeenCalledWith({
      pack: "credits_100",
      successUrl: window.location.href,
      cancelUrl: window.location.href,
    });
    expect(io.navigate).toHaveBeenCalledWith("https://stripe.example/packs");
  });

  it("uses the credits fallback message on failure", async () => {
    const io = makeIo();
    const operations = buildBillingOperations({
      actions: buildCheckoutAdapters(makeGateways()).stripe,
      createOneTimeSession: vi.fn().mockRejectedValue(new Error("nope")),
      interval: "monthly",
      messages,
      io,
    });

    await operations.buyCredits("lifetime");

    expect(io.setError).toHaveBeenLastCalledWith("friendly: credits failed");
    expect(io.setBusy).toHaveBeenLastCalledWith(null);
  });
});
