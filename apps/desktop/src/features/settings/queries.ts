import { useQuery } from "@tanstack/react-query";
import { listInputDevices } from "../../data/audio";
import * as settingsData from "../../data/settings";
import type { StoredSettings } from "../../types";

const SETTINGS_ROOT = ["settings"] as const;

export const settingsKeys = {
  all: SETTINGS_ROOT,
  detail: () => [...SETTINGS_ROOT, "detail"] as const,
  appInfo: () => ["appInfo"] as const,
  devices: () => ["inputDevices"] as const,
};

function settingsQuery<TSelect>(
  enabled: boolean,
  select?: (settings: StoredSettings) => TSelect,
) {
  return {
    queryKey: settingsKeys.detail(),
    queryFn: settingsData.getSettings,
    enabled,
    select,
  };
}

export function useSettings<TSelect = StoredSettings>(
  select?: (settings: StoredSettings) => TSelect,
  enabled = true,
) {
  return useQuery(settingsQuery(enabled, select));
}

export const useAppInfo = (enabled = true) =>
  useQuery({
    queryKey: settingsKeys.appInfo(),
    queryFn: settingsData.getAppInfo,
    enabled,
    staleTime: Infinity,
  });

export const useInputDevices = (enabled = true) =>
  useQuery({
    queryKey: settingsKeys.devices(),
    queryFn: listInputDevices,
    enabled,
    refetchOnMount: "always",
  });
