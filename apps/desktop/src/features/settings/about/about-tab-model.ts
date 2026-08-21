import type { AppInfo, CliInstallStatus } from "../../../types/index";

export type StorageMetricKey =
  "recordings" | "library" | "models" | "database" | "total";

export type StorageMetric = {
  key: StorageMetricKey;
  bytes: number;
  primary: boolean;
};

export type CliState =
  | "unavailable"
  | "locked"
  | "external"
  | "managed"
  | "path-missing"
  | "available";

export function storageMetrics(appInfo: AppInfo | null): StorageMetric[] {
  const breakdown = appInfo?.storage_breakdown;
  return [
    {
      key: "recordings",
      bytes: breakdown?.recordings_bytes ?? 0,
      primary: false,
    },
    {
      key: "library",
      bytes: breakdown?.library_bytes ?? 0,
      primary: false,
    },
    {
      key: "models",
      bytes: breakdown?.models_bytes ?? 0,
      primary: false,
    },
    {
      key: "database",
      bytes: breakdown?.databases_bytes ?? 0,
      primary: false,
    },
    {
      key: "total",
      bytes: breakdown?.total_bytes ?? appInfo?.data_dir_size_bytes ?? 0,
      primary: true,
    },
  ];
}

export function classifyCli(
  status: CliInstallStatus | null,
  activeAccess: boolean,
): CliState {
  if (status?.sourceAvailable === false) return "unavailable";
  if (!activeAccess && !status?.installed) return "locked";
  if (status?.installed && !status.managedByApp) return "external";
  if (status?.installed) return "managed";
  if (status && !status.pathInShell) return "path-missing";
  return "available";
}
