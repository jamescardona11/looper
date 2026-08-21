import { describe, expect, test } from "vitest";
import {
  EDITION_COLORS,
  editionFromLicenseState,
  editionInfo,
} from "../licenseEdition";
import { tierInfo } from "../purchaseConfig";
import type { LicenseState } from "../../types/license";

const activeCommercial: LicenseState = {
  status: "active",
  licenseGateActive: true,
  trialActive: false,
  trialStartedAt: "2026-01-01T00:00:00Z",
  trialEndsAt: "2026-01-15T00:00:00Z",
  trialDaysRemaining: 0,
  activationsLimit: 1,
  edition: "commercial",
};

describe("edition and purchase rules", () => {
  test("resolves active editions and the inactive fallback", () => {
    expect(editionFromLicenseState(activeCommercial, true)).toBe("commercial");
    expect(editionFromLicenseState(activeCommercial, false)).toBe("personal");
    expect(editionFromLicenseState(null, true)).toBe("personal");
  });

  test("keeps edition copy and visual tokens aligned", () => {
    expect(editionInfo("founder")).toEqual({
      id: "founder",
      label: "Founder",
      blurb: "Launch founder. Up to 5 devices.",
    });
    expect(EDITION_COLORS.contributor).toEqual({
      fg: "var(--color-edition-contributor)",
      bg: "var(--surface-edition-contributor)",
    });
  });

  test("returns the configured purchase tier details", () => {
    expect(tierInfo("personal").price).toBe("$24.99");
    expect(tierInfo("commercial")).toMatchObject({
      price: "$48/seat/year",
      pickerPrice: "per seat",
    });
  });
});
