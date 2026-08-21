import { beforeEach, describe, expect, test, vi } from "vitest";

const platform = vi.hoisted(() => ({ id: "macos" }));
const permissions = vi.hoisted(() => ({
  checkAccessibility: vi.fn(),
  requestAccessibility: vi.fn(),
  checkInputMonitoring: vi.fn(),
  requestInputMonitoring: vi.fn(),
}));

vi.mock("../../../platform/service", () => ({
  detectAppPlatform: () => platform.id,
}));

vi.mock("tauri-plugin-macos-permissions-api", () => ({
  checkAccessibilityPermission: permissions.checkAccessibility,
  requestAccessibilityPermission: permissions.requestAccessibility,
  checkInputMonitoringPermission: permissions.checkInputMonitoring,
  requestInputMonitoringPermission: permissions.requestInputMonitoring,
}));

import {
  checkMacAccessibilityPermission,
  checkMacInputMonitoringPermission,
  requestMacAccessibilityPermission,
  requestMacInputMonitoringPermission,
} from "../macosPermissions";

describe("macOS permission gateway", () => {
  beforeEach(() => {
    platform.id = "macos";
    permissions.checkAccessibility.mockReset().mockResolvedValue(true);
    permissions.requestAccessibility.mockReset().mockResolvedValue(false);
    permissions.checkInputMonitoring.mockReset().mockResolvedValue(true);
    permissions.requestInputMonitoring.mockReset().mockResolvedValue(false);
  });

  test("delegates permission checks and requests on macOS", async () => {
    await expect(checkMacAccessibilityPermission()).resolves.toBe(true);
    await expect(requestMacAccessibilityPermission()).resolves.toBe(false);
    await expect(checkMacInputMonitoringPermission()).resolves.toBe(true);
    await expect(requestMacInputMonitoringPermission()).resolves.toBe(false);

    expect(permissions.checkAccessibility).toHaveBeenCalledOnce();
    expect(permissions.requestAccessibility).toHaveBeenCalledOnce();
    expect(permissions.checkInputMonitoring).toHaveBeenCalledOnce();
    expect(permissions.requestInputMonitoring).toHaveBeenCalledOnce();
  });

  test("treats the permissions as satisfied on other platforms", async () => {
    platform.id = "windows";

    await expect(checkMacAccessibilityPermission()).resolves.toBe(true);
    await expect(requestMacInputMonitoringPermission()).resolves.toBe(true);
    expect(permissions.checkAccessibility).not.toHaveBeenCalled();
    expect(permissions.requestInputMonitoring).not.toHaveBeenCalled();
  });
});
