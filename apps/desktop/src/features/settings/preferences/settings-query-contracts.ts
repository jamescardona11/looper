import { listInputDevices } from "../../../data/capture/audio";
import * as settingsData from "../../../data/settings";
import type { StoredSettings } from "../../../contracts/index";

const settingsKey = (...segments: string[]) =>
  ["settings", ...segments] as const;

export const settingsKeys = Object.freeze({
  all: settingsKey(),
  detail: () => settingsKey("detail"),
  appInfo: () => ["appInfo"] as const,
  devices: () => ["inputDevices"] as const,
});

export const settingsQueryOptions = {
  detail: <TSelect>(
    enabled: boolean,
    select?: (settings: StoredSettings) => TSelect,
  ) => ({
    queryKey: settingsKeys.detail(),
    queryFn: settingsData.getSettings,
    enabled,
    select,
  }),
  appInfo: (enabled: boolean) => ({
    queryKey: settingsKeys.appInfo(),
    queryFn: settingsData.getAppInfo,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  }),
  devices: (enabled: boolean) => ({
    queryKey: settingsKeys.devices(),
    queryFn: listInputDevices,
    enabled,
    refetchOnMount: "always" as const,
  }),
};
