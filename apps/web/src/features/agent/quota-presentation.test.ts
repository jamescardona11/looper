import { describe, expect, it } from "vitest";
import { hasDisplayableQuota } from "./quota-presentation";

describe("hasDisplayableQuota", () => {
  it("accepts a finite daily allowance", () => {
    expect(hasDisplayableQuota(10, 10)).toBe(true);
    expect(hasDisplayableQuota(0, 10)).toBe(true);
  });

  it("rejects missing, invalid, and unlimited values", () => {
    expect(hasDisplayableQuota(undefined, 10)).toBe(false);
    expect(hasDisplayableQuota(10, undefined)).toBe(false);
    expect(hasDisplayableQuota(Number.NaN, 10)).toBe(false);
    expect(hasDisplayableQuota(10, -1)).toBe(false);
  });
});
