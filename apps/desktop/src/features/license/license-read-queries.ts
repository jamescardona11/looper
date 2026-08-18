import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LicenseState } from "../../data/license";
import {
  identityHydrationOptions,
  licenseIdentityRefreshTarget,
  licenseReadOptions,
} from "./license-query-contracts";

export function useDictationStats() {
  return useQuery(licenseReadOptions.dictationStats());
}

export function useLicenseState() {
  return useQuery(licenseReadOptions.state());
}

export function useLicenseGate(): boolean {
  return useLicenseState().data?.licenseGateActive ?? false;
}

export function useHydrateLicenseIdentity(
  state: LicenseState | null | undefined,
) {
  const queryClient = useQueryClient();
  const identity = licenseIdentityRefreshTarget(state);
  return useQuery(identityHydrationOptions(queryClient, identity));
}
