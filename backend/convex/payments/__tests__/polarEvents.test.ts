import { getTierConfig } from "@looper/config/billing";
import { describe, expect, it } from "vitest";
import {
  initialCreditGrantFromPolarSubscription,
  type PolarSubscriptionLike,
  subscriptionStateFromPolarSubscription,
} from "../polarEvents";

const pro = getTierConfig("pro");
const proProduct = pro.polar.monthly;

describe("initialCreditGrantFromPolarSubscription", () => {
  it("grants the monthly allowance once, keyed by subscription id (metadata.userId)", () => {
    const sub: PolarSubscriptionLike = {
      id: "sub_polar_1",
      productId: proProduct,
      metadata: { userId: "u1" },
    };
    expect(initialCreditGrantFromPolarSubscription(sub)).toEqual({
      userId: "u1",
      credits: pro.credits.monthly,
      idempotencyKey: "polar_sub_sub_polar_1",
    });
  });

  it("grants the yearly allowance for the yearly product", () => {
    const sub: PolarSubscriptionLike = {
      id: "sub_polar_y",
      productId: pro.polar.yearly,
      metadata: { userId: "u1" },
    };
    expect(initialCreditGrantFromPolarSubscription(sub)).toEqual({
      userId: "u1",
      credits: pro.credits.yearly,
      idempotencyKey: "polar_sub_sub_polar_y",
    });
  });

  it("resolves the user via customer.externalId", () => {
    const grant = initialCreditGrantFromPolarSubscription({
      id: "s",
      product: { id: proProduct },
      customer: { externalId: "u2" },
    });
    expect(grant?.userId).toBe("u2");
  });

  it("resolves the user via customerExternalId", () => {
    const grant = initialCreditGrantFromPolarSubscription({
      id: "s",
      productId: proProduct,
      customerExternalId: "u3",
    });
    expect(grant?.userId).toBe("u3");
  });

  it("returns null for an unknown product (no plan credits)", () => {
    expect(
      initialCreditGrantFromPolarSubscription({
        id: "s",
        productId: "nope",
        metadata: { userId: "u1" },
      }),
    ).toBeNull();
  });

  it("returns null when user or subscription id can't be resolved", () => {
    expect(initialCreditGrantFromPolarSubscription({ id: "s", productId: proProduct })).toBeNull();
    expect(
      initialCreditGrantFromPolarSubscription({
        productId: proProduct,
        metadata: { userId: "u1" },
      }),
    ).toBeNull();
  });
});

describe("subscriptionStateFromPolarSubscription", () => {
  it("maps an active Pro subscription to tier+status (no expiry)", () => {
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", productId: proProduct }),
    ).toEqual({ tier: "pro", status: "active", expiresAt: undefined });
  });

  it("reads the productId from product.id too", () => {
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", product: { id: proProduct } })
        .tier,
    ).toBe("pro");
  });

  it("falls back to Pro when the product is unknown or missing", () => {
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", productId: "nope" }).tier,
    ).toBe("pro");
    expect(subscriptionStateFromPolarSubscription({ status: "active" }).tier).toBe("pro");
  });

  it("resolves the ultra tier from the ultra product", () => {
    const ultra = getTierConfig("ultra");
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", productId: ultra.polar.yearly })
        .tier,
    ).toBe("ultra");
  });

  it("collapses status: canceled→canceled, past_due→past_due, revoked→expired", () => {
    expect(subscriptionStateFromPolarSubscription({ status: "canceled" }).status).toBe("canceled");
    expect(subscriptionStateFromPolarSubscription({ status: "past_due" }).status).toBe("past_due");
    expect(subscriptionStateFromPolarSubscription({ status: "revoked" }).status).toBe("expired");
  });

  it("maps any other status (incl. trialing/unpaid/undefined) to active", () => {
    for (const status of ["trialing", "unpaid", "incomplete", undefined]) {
      expect(subscriptionStateFromPolarSubscription({ status }).status).toBe("active");
    }
  });

  it("parses expiresAt from endsAt (ISO date → ms)", () => {
    const iso = "2026-06-01T00:00:00.000Z";
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", endsAt: iso }).expiresAt,
    ).toBe(new Date(iso).getTime());
  });

  it("falls back to currentPeriodEnd when endsAt is absent", () => {
    const iso = "2026-07-15T12:00:00.000Z";
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", currentPeriodEnd: iso }).expiresAt,
    ).toBe(new Date(iso).getTime());
  });

  it("prefers endsAt over currentPeriodEnd", () => {
    const ends = "2026-06-01T00:00:00.000Z";
    const period = "2026-09-01T00:00:00.000Z";
    expect(
      subscriptionStateFromPolarSubscription({
        status: "active",
        endsAt: ends,
        currentPeriodEnd: period,
      }).expiresAt,
    ).toBe(new Date(ends).getTime());
  });

  it("leaves expiresAt undefined when neither date is present or the date is unparseable", () => {
    expect(subscriptionStateFromPolarSubscription({ status: "active" }).expiresAt).toBeUndefined();
    expect(
      subscriptionStateFromPolarSubscription({ status: "active", endsAt: "not-a-date" }).expiresAt,
    ).toBeUndefined();
  });
});
