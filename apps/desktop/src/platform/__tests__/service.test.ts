import { afterEach, describe, expect, test, vi } from "vitest";
import { detectAppPlatform, getPlatformCapabilities } from "../service";

function useNavigator(platform: string, userAgent = ""): void {
  vi.stubGlobal("navigator", { platform, userAgent });
}

describe("desktop platform detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reports unsupported outside a browser", () => {
    vi.stubGlobal("navigator", undefined);

    expect(detectAppPlatform()).toBe("unsupported");
    expect(getPlatformCapabilities()).toEqual({
      id: "unsupported",
      requiresNativeMicrophonePermission: false,
      requiresAccessibilityPermission: false,
      requiresInputMonitoringPermission: false,
      supportsAutoPauseMedia: false,
      usesCustomWindowControls: false,
    });
  });

  test("enables native permissions on macOS", () => {
    useNavigator("MacIntel");

    expect(getPlatformCapabilities()).toEqual({
      id: "macos",
      requiresNativeMicrophonePermission: true,
      requiresAccessibilityPermission: true,
      requiresInputMonitoringPermission: true,
      supportsAutoPauseMedia: true,
      usesCustomWindowControls: false,
    });
  });

  test("enables custom controls on Windows", () => {
    useNavigator("Win32");

    expect(getPlatformCapabilities()).toEqual({
      id: "windows",
      requiresNativeMicrophonePermission: false,
      requiresAccessibilityPermission: false,
      requiresInputMonitoringPermission: false,
      supportsAutoPauseMedia: true,
      usesCustomWindowControls: true,
    });
  });

  test("uses the user agent when the platform hint is empty", () => {
    useNavigator("", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

    expect(detectAppPlatform()).toBe("windows");
  });
});
