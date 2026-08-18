import type { QueryClient } from "@tanstack/react-query";
import * as licenseApi from "../../data/license";
import type { LicenseState } from "../../data/license";

const licenseKey = (...segments: string[]) => ["license", ...segments] as const;

export const licenseKeys = Object.freeze({
  state: () => licenseKey("state"),
  dictationStats: () => licenseKey("dictation-stats"),
  identity: (identity: string) => licenseKey("identity", identity),
});

export const licenseReadOptions = Object.freeze({
  dictationStats: () => ({
    queryKey: licenseKeys.dictationStats(),
    queryFn: licenseApi.getDictationStats,
  }),
  state: () => ({
    queryKey: licenseKeys.state(),
    queryFn: licenseApi.getLicenseState,
  }),
});

export function licenseIdentityRefreshTarget(
  state: LicenseState | null | undefined,
): string | null {
  const hasIdentity = Boolean(state?.customerName?.trim());
  if (state?.status !== "active" || hasIdentity) return null;
  return state.displayKey ?? state.customerEmail ?? "active-member";
}

export function publishLicenseState(
  queryClient: QueryClient,
  state: LicenseState,
): void {
  queryClient.setQueryData(licenseKeys.state(), state);
  void queryClient.invalidateQueries({ queryKey: ["settings"] });
}

export function identityHydrationOptions(
  queryClient: QueryClient,
  identity: string | null,
) {
  return {
    queryKey: licenseKeys.identity(identity ?? "inactive"),
    enabled: identity !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const state = await licenseApi.refreshLicense();
      publishLicenseState(queryClient, state);
      return state;
    },
  };
}
