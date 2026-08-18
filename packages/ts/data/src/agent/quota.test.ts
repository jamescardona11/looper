import { describe, expect, it } from "vitest";
import { isCreditsLow, quotaBlocksSend } from "./quota";

describe("isCreditsLow", () => {
  it("uses the 20% threshold when 20% of the limit exceeds the floor of 2", () => {
    // floor(100 * 0.2) = 20 -> low at or below 20, not low above it.
    expect(isCreditsLow(20, 100)).toBe(true);
    expect(isCreditsLow(21, 100)).toBe(false);
  });

  it("clamps to an absolute floor of 2 when 20% of the limit is below 2", () => {
    // floor(5 * 0.2) = 1, but Math.max(2, 1) = 2 -> low at <=2, not at 3.
    expect(isCreditsLow(2, 5)).toBe(true);
    expect(isCreditsLow(3, 5)).toBe(false);
  });

  it("floors the 20% computation rather than rounding", () => {
    // floor(14 * 0.2) = floor(2.8) = 2 (not 3) -> remaining 3 is NOT low.
    expect(isCreditsLow(2, 14)).toBe(true);
    expect(isCreditsLow(3, 14)).toBe(false);
  });

  it("treats zero remaining as low regardless of limit", () => {
    expect(isCreditsLow(0, 100)).toBe(true);
  });
});

describe("quotaBlocksSend", () => {
  it("blocks when no messages remain on a metered tier", () => {
    expect(quotaBlocksSend(false, 0)).toBe(true);
  });

  it("does not block while messages remain", () => {
    expect(quotaBlocksSend(false, 3)).toBe(false);
  });

  it("never blocks a bring-your-own-key user", () => {
    expect(quotaBlocksSend(true, 0)).toBe(false);
  });

  it("never blocks an unlimited tier (remaining null/undefined)", () => {
    expect(quotaBlocksSend(false, null)).toBe(false);
    expect(quotaBlocksSend(false, undefined)).toBe(false);
  });

  it("blocks defensively on a negative remaining", () => {
    expect(quotaBlocksSend(false, -1)).toBe(true);
  });
});
