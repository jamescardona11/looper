import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as licenseApi from "../../data/license";
import type { LicenseState } from "../../data/license";

const STATE_KEY = ["license", "state"] as const;
const USAGE_KEY = ["license", "dictation-stats"] as const;

export const licenseKeys = {
  state: () => STATE_KEY,
  dictationStats: () => USAGE_KEY,
  identity: (identity: string) => ["license", "identity", identity] as const,
};

export function useDictationStats() {
  return useQuery({
    queryKey: licenseKeys.dictationStats(),
    queryFn: licenseApi.getDictationStats,
  });
}

export function useLicenseState() {
  return useQuery({
    queryKey: licenseKeys.state(),
    queryFn: licenseApi.getLicenseState,
  });
}

export function useLicenseGate(): boolean {
  return useLicenseState().data?.licenseGateActive ?? false;
}

type LicenseCommand<TInput> = (input: TInput) => Promise<LicenseState>;

function useLicenseCommand<TInput>(command: LicenseCommand<TInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: (state) => {
      queryClient.setQueryData(licenseKeys.state(), state);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useActivateLicense() {
  return useLicenseCommand(licenseApi.activateLicense);
}

export function useRefreshLicense() {
  return useLicenseCommand<void>(() => licenseApi.refreshLicense());
}

export function useDeactivateLicense() {
  return useLicenseCommand<void>(() => licenseApi.deactivateLicense());
}

export function licenseIdentityRefreshTarget(
  state: LicenseState | null | undefined,
): string | null {
  if (!state || state.status !== "active" || state.customerName?.trim()) {
    return null;
  }
  return state.displayKey ?? state.customerEmail ?? "active-member";
}

export function useHydrateLicenseIdentity(
  state: LicenseState | null | undefined,
) {
  const queryClient = useQueryClient();
  const identity = licenseIdentityRefreshTarget(state);
  return useQuery({
    queryKey: licenseKeys.identity(identity ?? "inactive"),
    enabled: identity !== null,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const refreshed = await licenseApi.refreshLicense();
      queryClient.setQueryData(licenseKeys.state(), refreshed);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      return refreshed;
    },
  });
}
