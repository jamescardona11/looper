import { type QueryClient, useQuery } from "@tanstack/react-query";
import type { ModeRule, Personality } from "../../types";
import {
  installedAppsQuery,
  modeRulesQuery,
  personalizationKeys,
  personalitiesQuery,
  websiteIconsQuery,
} from "./personalization-query-policy";

export { personalizationKeys } from "./personalization-query-policy";

export function usePersonalities(enabled = true) {
  return useQuery(personalitiesQuery(enabled));
}

export function useInstalledApps(enabled = true) {
  return useQuery(installedAppsQuery(enabled));
}

export function useWebsiteIconMap(sites: string[], enabled = true) {
  return useQuery(websiteIconsQuery(sites, enabled));
}

export function setPersonalitiesCache(
  queryClient: QueryClient,
  personalities: Personality[],
) {
  queryClient.setQueryData(personalizationKeys.personalities(), personalities);
}

export function useModeRules(enabled = true) {
  return useQuery(modeRulesQuery(enabled));
}

export function setModeRulesCache(
  queryClient: QueryClient,
  modeRules: ModeRule[],
) {
  queryClient.setQueryData(personalizationKeys.modeRules(), modeRules);
}
