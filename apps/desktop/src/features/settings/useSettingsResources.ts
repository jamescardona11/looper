import { useEffect, useMemo } from "react";

import { useLicenseGate, useLicenseState } from "../license/queries";
import {
  useCliInstallStatus,
  useInstallCli,
  useModelCatalog,
  useModelStatuses,
  useRemoveCli,
} from "./models-queries";
import { useAppInfo, useInputDevices, useSettings } from "./queries";
import { useSettingsPermissions } from "./useSettingsPermissions";

type SettingsResourcesOptions = {
  enabled: boolean;
  permissionsVisible: boolean;
};

export function useSettingsResources({
  enabled,
  permissionsVisible,
}: SettingsResourcesOptions) {
  const settings = useSettings(undefined, enabled);
  const license = useLicenseState();
  const licenseGateActive = useLicenseGate();
  const appInfo = useAppInfo(enabled);
  const inputs = useInputDevices(enabled);
  const catalog = useModelCatalog(enabled);
  const cliStatus = useCliInstallStatus(enabled);
  const cliInstall = useInstallCli();
  const cliRemoval = useRemoveCli();
  const modelKeys = useMemo(
    () => (catalog.data ?? []).map(({ key }) => key),
    [catalog.data],
  );
  const statuses = useModelStatuses(
    modelKeys,
    enabled && modelKeys.length !== 0,
  );
  const permissions = useSettingsPermissions(enabled && permissionsVisible);

  useEffect(() => {
    if (cliStatus.error) {
      console.error("Failed to load CLI install status:", cliStatus.error);
    }
  }, [cliStatus.error]);

  const loading =
    enabled &&
    [settings, catalog, inputs, appInfo, license].some(
      (query) => query.isLoading,
    );

  return {
    settings,
    loading,
    license: {
      gateActive: licenseGateActive,
      active: license.data?.status === "active",
    },
    app: {
      info: appInfo.data ?? null,
      inputs: inputs.data ?? [],
      permissions,
    },
    models: {
      catalog: catalog.data ?? [],
      statusByKey: statuses.statusByModel,
    },
    cli: {
      status: cliStatus.data ?? null,
      busy: cliInstall.isPending || cliRemoval.isPending,
      install: cliInstall.mutateAsync,
      remove: cliRemoval.mutateAsync,
    },
  };
}
