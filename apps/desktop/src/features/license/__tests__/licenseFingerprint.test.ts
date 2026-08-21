import { describe, expect, test } from "vitest";

import {
  mulberry32,
  seededDotField,
  seedFromLicenseKey,
} from "../licenseFingerprint";

describe("member card fingerprint", () => {
  test("derives the seed from the final eight alphanumeric characters", () => {
    expect(seedFromLicenseKey("LOOPER-ABC-12345678")).toBe(2_433_613_956);
    expect(seedFromLicenseKey("prefix-ABCDEFGH")).toBe(2_042_300_548);
    expect(seedFromLicenseKey("---")).toBe(seedFromLicenseKey("looper"));
  });

  test("keeps the deterministic random sequence stable", () => {
    const random = mulberry32(seedFromLicenseKey("LOOPER-ABC-12345678"));

    expect([random(), random(), random()]).toEqual([
      0.2092348940204829, 0.01994888624176383, 0.9231972275301814,
    ]);
  });

  test("keeps the visible dot pattern stable for a license", () => {
    expect([...seededDotField("LOOPER-ABC-12345678", 3, 4)]).toEqual([
      0, 1, 4, 6, 8, 9, 10, 11,
    ]);
    expect([...seededDotField(null, 3, 4)]).toEqual([2, 4, 6, 7]);
  });

  test("supports empty and fully active fields", () => {
    expect(seededDotField("key", 0, 4)).toEqual(new Set());
    expect(seededDotField("key", 2, 3, 1)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });
});
