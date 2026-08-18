import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LicenseState } from "../shared/types/license";

export type { LicenseState } from "../shared/types/license";

export type DictationStats = {
  totalWords: number;
  totalDurationMs: number;
  totalDictations: number;
};

type EntitlementCommand =
  | "get_license_state"
  | "activate_license"
  | "refresh_license"
  | "deactivate_license"
  | "get_dictation_stats";

function callEntitlement<TResult>(
  command: EntitlementCommand,
  argumentsByName?: Record<string, unknown>,
): Promise<TResult> {
  return argumentsByName === undefined
    ? invoke(command)
    : invoke(command, argumentsByName);
}

export const getLicenseState = (): Promise<LicenseState> =>
  callEntitlement("get_license_state");

export const activateLicense = (key: string): Promise<LicenseState> =>
  callEntitlement("activate_license", { args: { key } });

export const refreshLicense = (): Promise<LicenseState> =>
  callEntitlement("refresh_license");

export const deactivateLicense = (): Promise<LicenseState> =>
  callEntitlement("deactivate_license");

export const getDictationStats = (): Promise<DictationStats> =>
  callEntitlement("get_dictation_stats");

export const subscribeLicenseCheckoutReturned = (handler: () => void) =>
  listen("license:checkout-returned", handler);
