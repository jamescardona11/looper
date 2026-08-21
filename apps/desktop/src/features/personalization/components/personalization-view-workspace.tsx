import { Plus } from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import type { Personality } from "../../../contracts";
import type { InstalledApp } from "../../../data/personalization";
import DotMatrix from "../../../shared/ui/DotMatrix";
import ScreenHeader from "../../../shared/ui/ScreenHeader";
import WorkspacePage from "../../../shared/ui/WorkspacePage";
import ModeRulesSection from "./ModeRulesSection";
import PersonalityModal, {
  type PendingDeletePersonality,
} from "./PersonalityModal";
import type {
  InstalledAppIndexes,
  PersonalizationViewActions,
} from "./personalization-view-model";
import { PersonalizationStyleBrowser } from "./personalization-view-style-browser";
import { PersonalizationDeleteDialog } from "./personalization-view-delete-dialog";

type WorkspacePersonalizationProps = {
  actions: PersonalizationViewActions;
  activePersonality: Personality | null;
  embedded: boolean;
  errorMessage: string | null;
  installedAppIndexes: InstalledAppIndexes;
  installedApps: InstalledApp[];
  isActive: boolean;
  loading: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  pendingDelete: PendingDeletePersonality | null;
  personalities: Personality[];
  selectedPersonalityId: string | null;
  shiftHeld: boolean;
  showModeRules: boolean;
  websiteIconBySite: Record<string, string>;
};

export function WorkspacePersonalization({
  actions,
  activePersonality,
  embedded,
  errorMessage,
  installedAppIndexes,
  installedApps,
  isActive,
  loading,
  onCancelDelete,
  onConfirmDelete,
  pendingDelete,
  personalities,
  selectedPersonalityId,
  shiftHeld,
  showModeRules,
  websiteIconBySite,
}: WorkspacePersonalizationProps) {
  return (
    <WorkspacePage
      className={`px-0 text-left ${embedded ? "" : "max-w-7xl mx-auto"}`}
      header={
        embedded ? null : (
          <PersonalizationHeader onAdd={actions.addPersonality} />
        )
      }
    >
      <PersonalizationBody
        actions={actions}
        installedAppIndexes={installedAppIndexes}
        loading={loading}
        personalities={personalities}
        selectedPersonalityId={selectedPersonalityId}
        shiftHeld={shiftHeld}
        websiteIconBySite={websiteIconBySite}
      />

      {errorMessage ? (
        <div className="mt-4 ui-text-body-sm ui-color-error-soft">
          {errorMessage}
        </div>
      ) : null}

      {showModeRules ? (
        <ModeRulesSection isActive={isActive} installedApps={installedApps} />
      ) : null}

      {activePersonality ? (
        <PersonalityModal
          personality={activePersonality}
          installedApps={installedApps}
          websiteIconBySite={websiteIconBySite}
          onClose={actions.closeEditor}
          onUpdate={(patch) =>
            actions.patchPersonality(activePersonality.id, patch)
          }
          onUpdateList={(update) =>
            actions.replacePersonality(activePersonality.id, update)
          }
          onAssignApp={(app) => actions.assignApp(activePersonality.id, app)}
          onDelete={() => actions.requestDelete(activePersonality)}
        />
      ) : null}

      <PersonalizationDeleteDialog
        pendingDelete={pendingDelete}
        cancel={onCancelDelete}
        confirm={onConfirmDelete}
      />
    </WorkspacePage>
  );
}

function PersonalizationHeader({ onAdd }: { onAdd: () => void }) {
  const { t } = useLingui();
  return (
    <ScreenHeader
      className="mb-6 mt-2 md:-mt-6"
      icon={
        <DotMatrix
          rows={2}
          cols={3}
          activeDots={[0, 1, 4, 5]}
          dotSize={3}
          gap={3}
          color="var(--color-section-marker-alt)"
        />
      }
      title={t({ id: "personalization.title", message: "Styles" })}
      description={t({
        id: "personalization.description",
        message:
          "How your dictation reads in each app. Every style shows you an example — no prompts to write.",
      })}
      trailing={
        <button
          type="button"
          onClick={onAdd}
          aria-label={t({
            id: "personalization.new_mode",
            message: "New mode",
          })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-accent-20)] bg-[var(--color-accent-10)] px-3 py-1.5 ui-text-button text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent-30)] hover:bg-[var(--color-accent-20)]"
        >
          <Plus
            size={13}
            aria-hidden="true"
            className="text-[var(--color-accent)]"
          />
          {t({ id: "personalization.new_mode", message: "New mode" })}
        </button>
      }
    />
  );
}

function PersonalizationBody({
  actions,
  installedAppIndexes,
  loading,
  personalities,
  selectedPersonalityId,
  shiftHeld,
  websiteIconBySite,
}: {
  actions: PersonalizationViewActions;
  installedAppIndexes: InstalledAppIndexes;
  loading: boolean;
  personalities: Personality[];
  selectedPersonalityId: string | null;
  shiftHeld: boolean;
  websiteIconBySite: Record<string, string>;
}) {
  const { t } = useLingui();
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <DotMatrix
          rows={2}
          cols={6}
          activeDots={[0, 1, 2, 3, 4, 5]}
          dotSize={3}
          gap={3}
          color="var(--color-content-muted)"
          animated
          className="opacity-60"
        />
      </div>
    );
  }
  if (personalities.length === 0) {
    return (
      <div className="rounded-xl border border-border-primary bg-surface-secondary px-6 py-8 ui-color-muted">
        <p className="ui-text-body-lg-strong">
          {t({
            id: "personalization.empty.title",
            message: "No modes yet",
          })}
        </p>
        <p className="ui-text-body-sm ui-color-muted">
          {t({
            id: "personalization.empty.description",
            message:
              "Create a mode to start customizing your apps and websites.",
          })}
        </p>
      </div>
    );
  }
  return (
    <PersonalizationStyleBrowser
      actions={actions}
      installedAppIndexes={installedAppIndexes}
      personalities={personalities}
      selectedPersonalityId={selectedPersonalityId}
      shiftHeld={shiftHeld}
      websiteIconBySite={websiteIconBySite}
    />
  );
}
