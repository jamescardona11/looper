import { getTierConfig } from "@looper/config/billing";
import { describe, expect, it } from "vitest";
import {
  creditGrantFromRevenueCatEvent,
  type RevenueCatEventLike,
  subscriptionStateFromRevenueCatEvent,
} from "./revenueCatEvents";

const pro = getTierConfig("pro");
const monthlyProduct = pro.revenueCat.monthly; // → pro.credits.monthly
const yearlyProduct = pro.revenueCat.yearly; // → pro.credits.yearly
const proEntitlement = pro.revenueCat.entitlement;

function ev(type: string, product_id?: string, app_user_id = "u1"): RevenueCatEventLike {
  return { type, app_user_id, product_id };
}

describe("creditGrantFromRevenueCatEvent", () => {
  it("grants the monthly allowance on INITIAL_PURCHASE", () => {
    expect(creditGrantFromRevenueCatEvent(ev("INITIAL_PURCHASE", monthlyProduct))).toEqual({
      credits: pro.credits.monthly,
      appUserId: "u1",
    });
  });

  it("grants the yearly allowance on RENEWAL", () => {
    expect(creditGrantFromRevenueCatEvent(ev("RENEWAL", yearlyProduct))?.credits).toBe(
      pro.credits.yearly,
    );
  });

  it("does NOT grant on CANCELLATION / EXPIRATION / PRODUCT_CHANGE / BILLING_ISSUE", () => {
    for (const type of ["CANCELLATION", "EXPIRATION", "PRODUCT_CHANGE", "BILLING_ISSUE"]) {
      expect(creditGrantFromRevenueCatEvent(ev(type, monthlyProduct))).toBeNull();
    }
  });

  it("does NOT grant for an unknown or missing product", () => {
    expect(creditGrantFromRevenueCatEvent(ev("RENEWAL", "rc_unknown"))).toBeNull();
    expect(creditGrantFromRevenueCatEvent(ev("RENEWAL", undefined))).toBeNull();
  });

  it("does NOT grant without an app_user_id", () => {
    expect(creditGrantFromRevenueCatEvent(ev("INITIAL_PURCHASE", monthlyProduct, ""))).toBeNull();
  });
});

describe("subscriptionStateFromRevenueCatEvent", () => {
  it("maps an active purchase with the pro entitlement to tier+status+entitlement", () => {
    expect(
      subscriptionStateFromRevenueCatEvent({
        type: "INITIAL_PURCHASE",
        entitlement_ids: [proEntitlement],
        expiration_at_ms: 1_700_000,
      }),
    ).toEqual({
      tier: "pro",
      status: "active",
      expiresAt: 1_700_000,
      entitlement: proEntitlement,
    });
  });

  it("uses the FIRST entitlement id when several are present", () => {
    const s = subscriptionStateFromRevenueCatEvent({
      type: "RENEWAL",
      entitlement_ids: [proEntitlement, "ultra"],
    });
    expect(s.entitlement).toBe(proEntitlement);
    expect(s.tier).toBe("pro");
  });

  it("resolves ultra from the ultra entitlement", () => {
    const ultra = getTierConfig("ultra");
    expect(
      subscriptionStateFromRevenueCatEvent({
        type: "RENEWAL",
        entitlement_ids: [ultra.revenueCat.entitlement],
      }).tier,
    ).toBe("ultra");
  });

  it("falls back to pro for an unknown entitlement", () => {
    expect(
      subscriptionStateFromRevenueCatEvent({ type: "RENEWAL", entitlement_ids: ["mystery"] }).tier,
    ).toBe("pro");
  });

  it("maps no entitlement to the free tier with undefined entitlement", () => {
    const s = subscriptionStateFromRevenueCatEvent({ type: "EXPIRATION" });
    expect(s.tier).toBe("free");
    expect(s.entitlement).toBeUndefined();
  });

  it("collapses status: CANCELLATION→canceled, EXPIRATION→expired, BILLING_ISSUE→past_due", () => {
    expect(subscriptionStateFromRevenueCatEvent({ type: "CANCELLATION" }).status).toBe("canceled");
    expect(subscriptionStateFromRevenueCatEvent({ type: "EXPIRATION" }).status).toBe("expired");
    expect(subscriptionStateFromRevenueCatEvent({ type: "BILLING_ISSUE" }).status).toBe("past_due");
  });

  it("maps any other type to active", () => {
    for (const type of ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"]) {
      expect(subscriptionStateFromRevenueCatEvent({ type }).status).toBe("active");
    }
  });

  it("passes expiration_at_ms through (undefined when absent)", () => {
    expect(
      subscriptionStateFromRevenueCatEvent({ type: "RENEWAL", expiration_at_ms: 42 }).expiresAt,
    ).toBe(42);
    expect(subscriptionStateFromRevenueCatEvent({ type: "RENEWAL" }).expiresAt).toBeUndefined();
  });
});
