import { describe, expect, expectTypeOf, it } from "vitest";
import {
  LICENSE_EDITIONS,
  LICENSE_STATUSES,
  type LicenseState,
} from "./license";

describe("license wire contracts", () => {
  it("keeps the status and edition catalogs in wire order", () => {
    expect(LICENSE_STATUSES.join(" -> ")).toBe(
      "trial -> active -> expired -> invalid",
    );
    expect(LICENSE_EDITIONS.join(" -> ")).toBe(
      "personal -> commercial -> founder -> contributor",
    );
  });

  it("keeps required state and nullable metadata compatible", () => {
    expectTypeOf<LicenseState["status"]>().toEqualTypeOf<
      "trial" | "active" | "expired" | "invalid"
    >();
    expectTypeOf<LicenseState["licenseGateActive"]>().toEqualTypeOf<boolean>();
    expectTypeOf<LicenseState["trialActive"]>().toEqualTypeOf<boolean>();
    expectTypeOf<LicenseState["trialStartedAt"]>().toEqualTypeOf<string>();
    expectTypeOf<LicenseState["trialEndsAt"]>().toEqualTypeOf<string>();
    expectTypeOf<LicenseState["trialDaysRemaining"]>().toEqualTypeOf<number>();
    expectTypeOf<LicenseState["activationsLimit"]>().toEqualTypeOf<number>();
    expectTypeOf<LicenseState["edition"]>().toEqualTypeOf<
      "personal" | "commercial" | "founder" | "contributor" | null | undefined
    >();
    expectTypeOf<LicenseState["validations"]>().toEqualTypeOf<
      number | null | undefined
    >();
  });
});
