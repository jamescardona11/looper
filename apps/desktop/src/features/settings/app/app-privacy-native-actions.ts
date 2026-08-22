import {
  checkMacInputMonitoringPermission,
  requestMacAccessibilityPermission,
  requestMacInputMonitoringPermission,
} from "../../../shared/lib/macosPermissions";
import {
  openAccessibilitySettings,
  openInputMonitoringSettings,
} from "../../../data/settings";

async function requestOrOpenSettings(
  request: () => Promise<boolean>,
  openSettings: () => Promise<unknown>,
) {
  try {
    if (!(await request())) await openSettings();
  } catch {
    await openSettings();
  }
}

export function requestAccessibilitySetting() {
  return requestOrOpenSettings(
    async () => Boolean(await requestMacAccessibilityPermission()),
    openAccessibilitySettings,
  );
}

export function requestInputMonitoringSetting() {
  return requestOrOpenSettings(async () => {
    await requestMacInputMonitoringPermission();
    return checkMacInputMonitoringPermission();
  }, openInputMonitoringSettings);
}
