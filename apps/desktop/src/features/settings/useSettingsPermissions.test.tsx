// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useSettingsPermissions } from "./useSettingsPermissions";

const mocks = vi.hoisted(() => ({
  checkMicrophone: vi.fn(),
  checkAccessibility: vi.fn(),
  checkInputMonitoring: vi.fn(),
  requestMicrophone: vi.fn(),
  openMicrophoneSettings: vi.fn(),
  onFocusChanged: vi.fn(),
  unlistenFocus: vi.fn(),
}));

vi.mock("../../platform/service", () => ({
  getPlatformCapabilities: () => ({
    id: "macos",
    requiresNativeMicrophonePermission: true,
    requiresAccessibilityPermission: true,
    requiresInputMonitoringPermission: true,
  }),
}));
vi.mock("../../shared/lib/macosPermissions", () => ({
  checkMacAccessibilityPermission: mocks.checkAccessibility,
  checkMacInputMonitoringPermission: mocks.checkInputMonitoring,
}));
vi.mock("../../data/settings", () => ({
  checkMicrophonePermission: mocks.checkMicrophone,
  requestMicrophonePermission: mocks.requestMicrophone,
  openMicrophoneSettings: mocks.openMicrophoneSettings,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onFocusChanged: mocks.onFocusChanged }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkMicrophone.mockResolvedValue(true);
  mocks.checkAccessibility.mockResolvedValue(true);
  mocks.checkInputMonitoring.mockResolvedValue(true);
  mocks.requestMicrophone.mockResolvedValue(undefined);
  mocks.openMicrophoneSettings.mockResolvedValue(undefined);
  mocks.onFocusChanged.mockResolvedValue(mocks.unlistenFocus);
});

describe("useSettingsPermissions", () => {
  test("does not read or subscribe while the settings section is inactive", () => {
    const { result } = renderPermissionHook(false);

    expect(result.current.microphone).toBeNull();
    expect(mocks.checkMicrophone).not.toHaveBeenCalled();
    expect(mocks.onFocusChanged).not.toHaveBeenCalled();
  });

  test("refreshes every required permission and releases the focus listener", async () => {
    mocks.checkMicrophone.mockResolvedValue(false);
    mocks.checkAccessibility.mockResolvedValue(true);
    mocks.checkInputMonitoring.mockRejectedValue(new Error("unavailable"));

    const { result, unmount } = renderPermissionHook(true);

    await waitFor(() => {
      expect(result.current.microphone).toBe(false);
      expect(result.current.accessibility).toBe(true);
      expect(result.current.inputMonitoring).toBe(false);
    });

    unmount();
    await waitFor(() => expect(mocks.unlistenFocus).toHaveBeenCalledOnce());
  });

  test("opens system settings when a microphone request remains denied", async () => {
    mocks.checkMicrophone.mockResolvedValue(false);
    const { result } = renderPermissionHook(true);

    await waitFor(() => expect(result.current.microphone).toBe(false));
    await act(() => result.current.requestMicrophone());

    expect(mocks.requestMicrophone).toHaveBeenCalledOnce();
    expect(mocks.openMicrophoneSettings).toHaveBeenCalledOnce();
  });
});

function renderPermissionHook(enabled: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSettingsPermissions(enabled), { wrapper });
}
