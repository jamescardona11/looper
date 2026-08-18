import * as personalizationGateway from "../../data/personalization";
import { buildWebsiteIconMap } from "./components/personalization-utils";

const PERSONALIZATION_CACHE_ROOT = ["personalization"] as const;
const CATALOG_STALE_TIME = 10 * 60 * 1000;

export const personalizationKeys = {
  all: PERSONALIZATION_CACHE_ROOT,
  personalities: () =>
    [...PERSONALIZATION_CACHE_ROOT, "personalities"] as const,
  installedApps: () =>
    [...PERSONALIZATION_CACHE_ROOT, "installedApps"] as const,
  websiteIcons: (sites: string[]) =>
    [...PERSONALIZATION_CACHE_ROOT, "websiteIcons", sites] as const,
  modeRules: () => [...PERSONALIZATION_CACHE_ROOT, "modeRules"] as const,
};

export function personalitiesQuery(enabled: boolean) {
  return {
    queryKey: personalizationKeys.personalities(),
    queryFn: personalizationGateway.getPersonalities,
    enabled,
  };
}

export function installedAppsQuery(enabled: boolean) {
  return {
    queryKey: personalizationKeys.installedApps(),
    queryFn: personalizationGateway.listInstalledApps,
    enabled,
    staleTime: CATALOG_STALE_TIME,
  };
}

export function websiteIconsQuery(sites: string[], enabled: boolean) {
  return {
    queryKey: personalizationKeys.websiteIcons(sites),
    queryFn: () => personalizationGateway.listWebsiteIcons(sites),
    enabled: enabled && sites.length > 0,
    select: buildWebsiteIconMap,
    staleTime: CATALOG_STALE_TIME,
  };
}

export function modeRulesQuery(enabled: boolean) {
  return {
    queryKey: personalizationKeys.modeRules(),
    queryFn: personalizationGateway.getModeRules,
    enabled,
  };
}
