import { useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { Personality } from "../../../contracts";
import type { InstalledApp } from "../../../data/personalization";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { personalizationKeys } from "../queries";

const ICON_REFRESH_DELAY_MS = 2500;
const errorIds = new WeakMap<object, number>();
let nextErrorId = 1;

type PersonalizationLifecycleProps = {
  activePersonalityId: string | null;
  clearActivePersonality: () => void;
  clearPendingDelete: () => void;
  installedApps: InstalledApp[];
  installedAppsLoading: boolean;
  isActive: boolean;
  pendingDeleteId: string | null;
  personalities: Personality[];
  personalitiesError: unknown;
  queryClient: QueryClient;
  websiteDomains: string[];
  websiteIconBySite: Record<string, string>;
};

export function PersonalizationLifecycle({
  activePersonalityId,
  clearActivePersonality,
  clearPendingDelete,
  installedApps,
  installedAppsLoading,
  isActive,
  pendingDeleteId,
  personalities,
  personalitiesError,
  queryClient,
  websiteDomains,
  websiteIconBySite,
}: PersonalizationLifecycleProps) {
  const refreshedApps = useRef(false);
  const refreshedWebsiteSet = useRef<string | null>(null);
  const appSignature = installedApps
    .map((app) => `${app.identifier}:${app.icon_path ? "icon" : "missing"}`)
    .join("|");
  const siteSignature = websiteDomains
    .map((site) => `${site}:${websiteIconBySite[site] ? "icon" : "missing"}`)
    .join("|");
  const activeExists = personalities.some(
    (personality) => personality.id === activePersonalityId,
  );

  return (
    <>
      <PersonalityErrorLogger
        key={errorIdentity(personalitiesError)}
        error={personalitiesError}
      />
      <WebsiteIconRefresh
        key={`${isActive}:${siteSignature}`}
        client={queryClient}
        domains={websiteDomains}
        enabled={isActive}
        iconPaths={websiteIconBySite}
        lastRefreshKey={refreshedWebsiteSet}
      />
      <InstalledAppIconRefresh
        key={`${isActive}:${installedAppsLoading}:${appSignature}`}
        apps={installedApps}
        client={queryClient}
        enabled={isActive}
        loading={installedAppsLoading}
        refreshCompleted={refreshedApps}
      />
      <SelectionLifecycle
        key={`${isActive}:${activePersonalityId ?? "none"}:${pendingDeleteId ?? "none"}:${activeExists}`}
        activePersonalityId={activePersonalityId}
        activePersonalityExists={activeExists}
        clearActivePersonality={clearActivePersonality}
        clearPendingDelete={clearPendingDelete}
        enabled={isActive}
        pendingDeleteId={pendingDeleteId}
      />
    </>
  );
}

function PersonalityErrorLogger({ error }: { error: unknown }) {
  useMountEffect(() => {
    if (error) console.error(error);
  });
  return null;
}

function WebsiteIconRefresh({
  client,
  domains,
  enabled,
  iconPaths,
  lastRefreshKey,
}: {
  client: QueryClient;
  domains: string[];
  enabled: boolean;
  iconPaths: Record<string, string>;
  lastRefreshKey: React.MutableRefObject<string | null>;
}) {
  useMountEffect(() => {
    if (!enabled || domains.length === 0) {
      lastRefreshKey.current = null;
      return;
    }

    const domainKey = domains.join("|");
    if (domains.every((domain) => Boolean(iconPaths[domain]))) {
      lastRefreshKey.current = domainKey;
      return;
    }
    if (lastRefreshKey.current === domainKey) return;

    const timeout = window.setTimeout(() => {
      lastRefreshKey.current = domainKey;
      void client.invalidateQueries({
        queryKey: personalizationKeys.websiteIcons(domains),
      });
    }, ICON_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  });
  return null;
}

function InstalledAppIconRefresh({
  apps,
  client,
  enabled,
  loading,
  refreshCompleted,
}: {
  apps: InstalledApp[];
  client: QueryClient;
  enabled: boolean;
  loading: boolean;
  refreshCompleted: React.MutableRefObject<boolean>;
}) {
  useMountEffect(() => {
    if (!enabled || refreshCompleted.current || loading || apps.length === 0) {
      return;
    }
    if (apps.every((app) => Boolean(app.icon_path))) {
      refreshCompleted.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      refreshCompleted.current = true;
      void client.invalidateQueries({
        queryKey: personalizationKeys.installedApps(),
      });
    }, ICON_REFRESH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  });
  return null;
}

function SelectionLifecycle({
  activePersonalityExists,
  activePersonalityId,
  clearActivePersonality,
  clearPendingDelete,
  enabled,
  pendingDeleteId,
}: {
  activePersonalityExists: boolean;
  activePersonalityId: string | null;
  clearActivePersonality: () => void;
  clearPendingDelete: () => void;
  enabled: boolean;
  pendingDeleteId: string | null;
}) {
  useMountEffect(() => {
    if (activePersonalityId && !activePersonalityExists) {
      clearActivePersonality();
    }
    if (!enabled) return;

    const closeTopLayer = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (pendingDeleteId) {
        event.preventDefault();
        clearPendingDelete();
      } else if (activePersonalityId) {
        event.preventDefault();
        clearActivePersonality();
      }
    };
    window.addEventListener("keydown", closeTopLayer);
    return () => window.removeEventListener("keydown", closeTopLayer);
  });
  return null;
}

function errorIdentity(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const knownId = errorIds.get(error);
    if (knownId !== undefined) return `object:${knownId}`;
    const assignedId = nextErrorId;
    nextErrorId += 1;
    errorIds.set(error, assignedId);
    return `object:${assignedId}`;
  }
  return error === null || error === undefined ? "none" : String(error);
}
