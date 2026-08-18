import { useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import type { Personality } from "../../../types";
import type { InstalledApp } from "../../../data/personalization";
import { useShiftHeld } from "../../../shared/hooks/useShiftHeld";
import {
  useInstalledApps,
  usePersonalities,
  useWebsiteIconMap,
} from "../queries";
import { createId } from "./personalization-utils";
import type { PendingDeletePersonality } from "./PersonalityModal";
import {
  blankPersonality,
  indexInstalledApps,
  websiteDomainsFor,
  type PersonalizationViewActions,
  type PersonalizationViewProps,
} from "./personalization-view-model";
import { usePersonalityPersistence } from "./personalization-view-persistence";
import { PersonalizationLifecycle } from "./personalization-view-lifecycle";
import { EmbeddedPersonalization } from "./personalization-view-embedded";
import { WorkspacePersonalization } from "./personalization-view-workspace";

const noPersonalities: Personality[] = [];
const noInstalledApps: InstalledApp[] = [];

export function PersonalizationViewContent({
  isActive = true,
  embedded = false,
  showModeRules = true,
}: PersonalizationViewProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<PendingDeletePersonality | null>(null);
  const shiftHeld = useShiftHeld(isActive);

  const personalitiesQuery = usePersonalities(isActive);
  const installedAppsQuery = useInstalledApps(isActive);
  const personalities = personalitiesQuery.data ?? noPersonalities;
  const installedApps = installedAppsQuery.data ?? noInstalledApps;
  const domains = useMemo(
    () => websiteDomainsFor(personalities),
    [personalities],
  );
  const websiteIconsQuery = useWebsiteIconMap(domains, isActive);
  const websiteIconBySite = websiteIconsQuery.data ?? {};
  const installedAppIndexes = useMemo(
    () => indexInstalledApps(installedApps),
    [installedApps],
  );
  const activePersonality =
    personalities.find((personality) => personality.id === activeId) ?? null;
  const { applyChange, saveError } = usePersonalityPersistence(personalities);

  const deletePersonality = (id: string) => {
    applyChange({ kind: "remove", id });
    setActiveId(null);
  };
  const actions: PersonalizationViewActions = {
    addPersonality: () => {
      const id = createId();
      const name = t({
        id: "personalization.new_mode.default_name",
        message: "New Mode",
      });
      applyChange({ kind: "prepend", personality: blankPersonality(id, name) });
      setActiveId(id);
    },
    assignApp: (id, app) => applyChange({ kind: "assign-app", id, app }),
    closeEditor: () => setActiveId(null),
    deletePersonality,
    editPersonality: setActiveId,
    patchPersonality: (id, patch) => applyChange({ kind: "patch", id, patch }),
    replacePersonality: (id, update) =>
      applyChange({ kind: "replace", id, update }),
    requestDelete: (personality) =>
      setPendingDelete({ id: personality.id, name: personality.name }),
    selectPersonality: setSelectedId,
  };
  const cancelDelete = () => setPendingDelete(null);
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    deletePersonality(id);
  };
  const queryFailure =
    personalitiesQuery.error ?? installedAppsQuery.error ?? null;
  const errorMessage =
    saveError ?? (queryFailure instanceof Error ? queryFailure.message : null);

  return (
    <>
      <PersonalizationLifecycle
        activePersonalityId={activeId}
        clearActivePersonality={() => setActiveId(null)}
        clearPendingDelete={cancelDelete}
        installedApps={installedApps}
        installedAppsLoading={installedAppsQuery.isLoading}
        isActive={isActive}
        pendingDeleteId={pendingDelete?.id ?? null}
        personalities={personalities}
        personalitiesError={personalitiesQuery.error}
        queryClient={queryClient}
        websiteDomains={domains}
        websiteIconBySite={websiteIconBySite}
      />
      {embedded && !showModeRules ? (
        <EmbeddedPersonalization
          actions={actions}
          activePersonality={activePersonality}
          installedApps={installedApps}
          personalities={personalities}
          selectedPersonalityId={selectedId}
          websiteIconBySite={websiteIconBySite}
        />
      ) : (
        <WorkspacePersonalization
          actions={actions}
          activePersonality={activePersonality}
          embedded={embedded}
          errorMessage={errorMessage}
          installedAppIndexes={installedAppIndexes}
          installedApps={installedApps}
          isActive={isActive}
          loading={isActive && personalitiesQuery.isLoading}
          onCancelDelete={cancelDelete}
          onConfirmDelete={confirmDelete}
          pendingDelete={pendingDelete}
          personalities={personalities}
          selectedPersonalityId={selectedId}
          shiftHeld={shiftHeld}
          showModeRules={showModeRules}
          websiteIconBySite={websiteIconBySite}
        />
      )}
    </>
  );
}
