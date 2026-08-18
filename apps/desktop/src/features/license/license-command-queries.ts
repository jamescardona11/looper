import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as licenseApi from "../../data/license";
import type { LicenseState } from "../../data/license";
import { publishLicenseState } from "./license-query-contracts";

type LicenseCommand<TInput> = (input: TInput) => Promise<LicenseState>;

function useLicenseCommand<TInput>(command: LicenseCommand<TInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: (state) => publishLicenseState(queryClient, state),
  });
}

export function useActivateLicense() {
  return useLicenseCommand(licenseApi.activateLicense);
}

export function useDeactivateLicense() {
  return useLicenseCommand<void>(() => licenseApi.deactivateLicense());
}
