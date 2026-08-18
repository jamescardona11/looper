import { getTierConfig, oneTimeGrant } from "@looper/config/billing";
import { describe, expect, it } from "vitest";
import {
  creditGrantFromInvoice,
  type InvoiceLike,
  oneTimeCheckoutPlan,
  subscriptionStateFromStripeSub,
} from "./stripeEvents";

const pro = getTierConfig("pro");
const proMonthly = pro.stripe.monthly; // maps to pro.credits.monthly
const proYearly = pro.stripe.yearly; // maps to pro.credits.yearly

// Build an invoice with one line at the given price + a userId in metadata.
function invoice(
  reason: string | null,
  priceId?: string,
  meta?: Record<string, string>,
): InvoiceLike {
  return {
    billing_reason: reason,
    customer: "cus_test",
    lines: priceId ? { data: [{ price: { id: priceId } }] } : { data: [] },
    parent: meta ? { subscription_details: { metadata: meta } } : undefined,
  };
}

describe("creditGrantFromInvoice", () => {
  it("grants the monthly allowance on the initial charge (subscription_create)", () => {
    const g = creditGrantFromInvoice(invoice("subscription_create", proMonthly, { userId: "u1" }));
    expect(g).toEqual({ credits: pro.credits.monthly, subUserId: "u1", customerId: "cus_test" });
  });

  it("grants the yearly allowance on a renewal (subscription_cycle)", () => {
    const g = creditGrantFromInvoice(invoice("subscription_cycle", proYearly, { userId: "u1" }));
    expect(g?.credits).toBe(pro.credits.yearly);
  });

  it("grants credits for a Stripe price supplied by environment", () => {
    const priceId = "price_test_pro_monthly";
    const g = creditGrantFromInvoice(invoice("subscription_cycle", priceId, { userId: "u1" }), {
      pro: { monthly: priceId },
    });
    expect(g?.credits).toBe(pro.credits.monthly);
  });

  it("does NOT grant on a proration/upgrade invoice (subscription_update) — bug #1", () => {
    expect(
      creditGrantFromInvoice(invoice("subscription_update", proMonthly, { userId: "u1" })),
    ).toBeNull();
  });

  it("does NOT grant on a manual invoice", () => {
    expect(creditGrantFromInvoice(invoice("manual", proMonthly, { userId: "u1" }))).toBeNull();
  });

  it("does NOT grant when the price maps to no plan credits", () => {
    expect(
      creditGrantFromInvoice(invoice("subscription_cycle", "price_unknown", { userId: "u1" })),
    ).toBeNull();
  });

  it("falls back to the customer id when no userId is on metadata", () => {
    const g = creditGrantFromInvoice(invoice("subscription_create", proMonthly));
    expect(g).toEqual({
      credits: pro.credits.monthly,
      subUserId: undefined,
      customerId: "cus_test",
    });
  });

  it("reads userId from the legacy (non-nested) subscription_details path too", () => {
    const inv: InvoiceLike = {
      billing_reason: "subscription_cycle",
      customer: null,
      lines: { data: [{ price: { id: proMonthly } }] },
      subscription_details: { metadata: { userId: "u2" } },
    };
    expect(creditGrantFromInvoice(inv)?.subUserId).toBe("u2");
  });

  it("does NOT grant when neither a userId nor a customer can be resolved", () => {
    const inv: InvoiceLike = {
      billing_reason: "subscription_cycle",
      customer: null,
      lines: { data: [{ price: { id: proMonthly } }] },
    };
    expect(creditGrantFromInvoice(inv)).toBeNull();
  });
});

describe("subscriptionStateFromStripeSub", () => {
  it("maps an active Pro subscription to tier+status (no expiry)", () => {
    const s = subscriptionStateFromStripeSub({
      id: "sub_1",
      status: "active",
      items: { data: [{ price: { id: proMonthly } }] },
    });
    expect(s).toEqual({
      tier: "pro",
      status: "active",
      stripeSubscriptionId: "sub_1",
      expiresAt: undefined,
    });
  });

  it("passes through trialing status", () => {
    const s = subscriptionStateFromStripeSub({
      id: "s",
      status: "trialing",
      items: { data: [{ price: { id: proMonthly } }] },
    });
    expect(s.status).toBe("trialing");
  });

  it("maps an environment-provided Ultra price to Ultra", () => {
    const priceId = "price_test_ultra_monthly";
    const s = subscriptionStateFromStripeSub(
      {
        id: "sub_ultra",
        status: "active",
        items: { data: [{ price: { id: priceId } }] },
      },
      { ultra: { monthly: priceId } },
    );
    expect(s.tier).toBe("ultra");
  });

  it("collapses any non-active/trialing status to past_due (grace, not a downgrade)", () => {
    for (const status of ["past_due", "incomplete", "unpaid"]) {
      expect(
        subscriptionStateFromStripeSub({
          id: "s",
          status,
          items: { data: [{ price: { id: proMonthly } }] },
        }).status,
      ).toBe("past_due");
    }
  });

  it("sets expiresAt from cancel_at (ms)", () => {
    const s = subscriptionStateFromStripeSub({
      id: "s",
      status: "active",
      cancel_at: 1_700,
      items: { data: [{ price: { id: proMonthly } }] },
    });
    expect(s.expiresAt).toBe(1_700_000);
  });

  it("falls back to Pro when the price is unknown or missing", () => {
    expect(
      subscriptionStateFromStripeSub({
        id: "s",
        status: "active",
        items: { data: [{ price: { id: "price_unknown" } }] },
      }).tier,
    ).toBe("pro");
    expect(subscriptionStateFromStripeSub({ id: "s", status: "active" }).tier).toBe("pro");
  });
});

describe("oneTimeCheckoutPlan", () => {
  const lifetime = oneTimeGrant("lifetime"); // { tier: "pro", credits: 10000 }

  it("returns null for a subscription checkout (not one_time)", () => {
    expect(oneTimeCheckoutPlan({ type: undefined }, null)).toBeNull();
    expect(oneTimeCheckoutPlan(undefined, null)).toBeNull();
  });

  it("credit pack → credits only, no tier/cancel", () => {
    const plan = oneTimeCheckoutPlan({ type: "one_time", pack: "credits_100" }, null);
    expect(plan).toEqual({ credits: oneTimeGrant("credits_100").credits });
  });

  it("lifetime for a new user → grants the tier + credits, nothing to cancel", () => {
    const plan = oneTimeCheckoutPlan({ type: "one_time", pack: "lifetime" }, null);
    expect(plan).toEqual({ lifetimeTier: lifetime.tier, credits: lifetime.credits });
  });

  it("lifetime keeps a HIGHER existing tier (no downgrade) and cancels the active sub", () => {
    const plan = oneTimeCheckoutPlan(
      { type: "one_time", pack: "lifetime" },
      { tier: "ultra", status: "active", stripeSubscriptionId: "sub_x" },
    );
    expect(plan).toEqual({
      lifetimeTier: "ultra", // not downgraded to the grant's "pro"
      cancelStripeSubscriptionId: "sub_x",
      credits: lifetime.credits,
    });
  });

  it("lifetime does NOT cancel a sub that is not active/trialing", () => {
    const plan = oneTimeCheckoutPlan(
      { type: "one_time", pack: "lifetime" },
      { tier: "pro", status: "canceled", stripeSubscriptionId: "sub_x" },
    );
    expect(plan?.cancelStripeSubscriptionId).toBeUndefined();
  });
});
