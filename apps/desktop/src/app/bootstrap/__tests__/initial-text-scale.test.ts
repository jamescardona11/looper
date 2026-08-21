import { describe, expect, test } from "vitest";

import { initialTextScale } from "../initial-text-scale";

describe("initialTextScale", () => {
  test("applies the stored setting only to the settings window", () => {
    expect(
      initialTextScale({
        disabled: false,
        windowLabel: "settings",
        storedMode: "large",
        platform: "macos",
      }),
    ).toBe("1.08");
    expect(
      initialTextScale({
        disabled: false,
        windowLabel: "main",
        storedMode: "large",
        platform: "macos",
      }),
    ).toBeNull();
  });

  test("leaves preview documents unchanged", () => {
    expect(
      initialTextScale({
        disabled: true,
        windowLabel: "settings",
        storedMode: "large",
        platform: "windows",
      }),
    ).toBeNull();
  });
});
