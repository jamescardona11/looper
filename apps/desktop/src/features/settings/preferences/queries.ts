import { useQuery } from "@tanstack/react-query";
import type { StoredSettings } from "../../../types/index";
import { settingsQueryOptions } from "./settings-query-contracts";

export { settingsKeys } from "./settings-query-contracts";

export function useSettings<TSelect = StoredSettings>(
  select?: (settings: StoredSettings) => TSelect,
  enabled = true,
) {
  return useQuery(settingsQueryOptions.detail(enabled, select));
}

export const useAppInfo = (enabled = true) =>
  useQuery(settingsQueryOptions.appInfo(enabled));

export const useInputDevices = (enabled = true) =>
  useQuery(settingsQueryOptions.devices(enabled));
