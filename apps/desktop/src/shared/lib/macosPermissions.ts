import { detectAppPlatform } from "../../platform/service";

type MacPermissionApi = typeof import("tauri-plugin-macos-permissions-api");

async function runMacPermission<T>(
  call: (api: MacPermissionApi) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (detectAppPlatform() !== "macos") return fallback;

  const api = await import("tauri-plugin-macos-permissions-api");
  return call(api);
}

export function checkMacAccessibilityPermission(): Promise<boolean> {
  return runMacPermission((api) => api.checkAccessibilityPermission(), true);
}

export function requestMacAccessibilityPermission(): Promise<unknown> {
  return runMacPermission((api) => api.requestAccessibilityPermission(), true);
}

export function checkMacInputMonitoringPermission(): Promise<boolean> {
  return runMacPermission((api) => api.checkInputMonitoringPermission(), true);
}

export function requestMacInputMonitoringPermission(): Promise<unknown> {
  return runMacPermission((api) => api.requestInputMonitoringPermission(), true);
}
