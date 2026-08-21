import {
  resolveStripeOneTimePriceId,
  resolveStripeTierPriceId,
  subscriptionCreditsForStripePrice,
  TIERS,
  tierFromStripePriceId,
  tierSatisfies,
} from "@looper/config/billing";
import { describe, expect, it } from "vitest";

describe("tierSatisfies", () => {
  it("free satisfies free", () => {
    expect(tierSatisfies("free", "free")).toBe(true);
  });

  it("pro satisfies free", () => {
    expect(tierSatisfies("pro", "free")).toBe(true);
  });

  it("free does NOT satisfy pro", () => {
    expect(tierSatisfies("free", "pro")).toBe(false);
  });

  it("ultra satisfies everything", () => {
    expect(tierSatisfies("ultra", "free")).toBe(true);
    expect(tierSatisfies("ultra", "pro")).toBe(true);
    expect(tierSatisfies("ultra", "ultra")).toBe(true);
  });
});

describe("TIERS config", () => {
  it("has 3 tiers", () => {
    expect(TIERS).toHaveLength(3);
  });

  it("each tier has a name and features", () => {
    for (const tier of TIERS) {
      expect(tier.name).toBeTruthy();
      expect(tier.features).toBeDefined();
      expect(tier.features.aiMessagesPerDay).toBeDefined();
    }
  });
});

describe("tierFromStripePriceId", () => {
  it("returns null for unknown price id", () => {
    expect(tierFromStripePriceId("price_unknown")).toBeNull();
  });

  it("maps environment overrides back to the correct tier and credits", () => {
    const overrides = {
      pro: { monthly: "price_test_pro_monthly" },
      oneTime: { credits_100: "price_test_credits_100" },
    };

    expect(resolveStripeTierPriceId("pro", "monthly", overrides)).toBe("price_test_pro_monthly");
    expect(tierFromStripePriceId("price_test_pro_monthly", overrides)).toBe("pro");
    expect(subscriptionCreditsForStripePrice("price_test_pro_monthly", overrides)).toBe(
      TIERS.find((tier) => tier.tier === "pro")?.credits.monthly,
    );
    expect(resolveStripeOneTimePriceId("credits_100", overrides)).toBe("price_test_credits_100");
  });
});
