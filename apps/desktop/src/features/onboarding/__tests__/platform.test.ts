import { afterEach, describe, expect, test, vi } from "vitest";

import { getOnboardingPlatform } from "../platform";

afterEach(() => vi.unstubAllGlobals());

describe("onboarding platform projection", () => {
  test("requests both native permissions on macOS", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "" });

    expect(getOnboardingPlatform()).toEqual({
      id: "macos",
      requiresMicrophonePermission: true,
      requiresAccessibilityPermission: true,
    });
  });

  test("does not request native permissions on Windows", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "" });

    expect(getOnboardingPlatform()).toEqual({
      id: "windows",
      requiresMicrophonePermission: false,
      requiresAccessibilityPermission: false,
    });
  });

  test("falls back to an unsupported platform without navigator", () => {
    vi.stubGlobal("navigator", undefined);

    expect(getOnboardingPlatform()).toEqual({
      id: "unsupported",
      requiresMicrophonePermission: false,
      requiresAccessibilityPermission: false,
    });
  });
});
