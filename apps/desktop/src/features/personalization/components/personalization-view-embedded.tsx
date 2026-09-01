import { AnimatePresence } from "framer-motion";
import { useLingui } from "@lingui/react/macro";
import type { Personality } from "../../../contracts";
import type { InstalledApp } from "../../../data/personalization";
import { voiceListAnatomy } from "../../voice/components/voice-list-anatomy";
import PersonalityModal from "./PersonalityModal";
import CompactStyleRow from "./CompactStyleRow";
import {
  selectedPersonality,
  type PersonalizationViewActions,
} from "./personalization-view-model";
import { StylePreview } from "./personalization-view-preview";
import { styleExampleFor } from "./personalization-style-example";
import { useSettings } from "../../settings/preferences/queries";

type EmbeddedPersonalizationProps = {
  actions: PersonalizationViewActions;
  activePersonality: Personality | null;
  installedApps: InstalledApp[];
  isActive: boolean;
  personalities: Personality[];
  selectedPersonalityId: string | null;
  studio: boolean;
  websiteIconBySite: Record<string, string>;
};

export function EmbeddedPersonalization({
  actions,
  activePersonality,
  installedApps,
  isActive,
  personalities,
  selectedPersonalityId,
  studio,
  websiteIconBySite,
}: EmbeddedPersonalizationProps) {
  const { t } = useLingui();
  const selected = selectedPersonality(personalities, selectedPersonalityId);
  const example = selected ? styleExampleFor(selected.name, t) : null;

  return (
    <div className="min-w-0 text-left">
      {studio ? (
        <>
          <div className="flex items-start justify-between gap-[18px] border-b border-border-primary pb-4">
            <div className="min-w-0">
              <h2 className="ui-text-title-strong ui-color-primary text-balance">
                {t({
                  id: "voice.writing.title",
                  message: "Writing for the work at hand",
                })}
              </h2>
              <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
                {t({
                  id: "voice.writing.description",
                  message:
                    "Cleanup applies to dictation shortcuts. Modes change output only where their saved destinations match.",
                })}
              </p>
            </div>
            <button
              className="h-9 shrink-0 rounded-[11px] bg-[var(--color-accent)] px-4 ui-text-button font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
              onClick={actions.addPersonality}
              type="button"
            >
              {t({ id: "voice.writing.new_mode", message: "New mode" })}
            </button>
          </div>
          <StudioCleanupLevel isActive={isActive} />
        </>
      ) : null}

      <div
        className={`flex items-center justify-between gap-4 ${
          studio ? "mt-[18px]" : ""
        }`}
      >
        <p className="ui-text-body-sm ui-color-muted">
          {studio
            ? t({
                id: "voice.writing.modes_description",
                message: "Writing modes saved for apps and websites.",
              })
            : t({
                id: "personalization.shared_list_description",
                message: "How Looper writes for you, per destination.",
              })}
        </p>
        <span className="shrink-0 ui-text-meta tabular-nums ui-color-muted">
          {personalities.length} of 20
        </span>
      </div>
      {studio ? null : (
        <button
          className={voiceListAnatomy.adder}
          onClick={actions.addPersonality}
          type="button"
        >
          {t({
            id: "personalization.add_style_inline",
            message: "Name a new style — “Support replies”…",
          })}
          <span className="font-semibold ui-color-primary">
            {t({ id: "personalization.add", message: "Add" })}
          </span>
        </button>
      )}

      {personalities.length === 0 ? (
        <div className="mt-4 border-y border-border-primary py-5 ui-text-body-sm ui-color-muted">
          {t({
            id: "voice.writing.empty",
            message:
              "No writing modes yet. Create one to define where it applies.",
          })}
        </div>
      ) : (
        <div className={voiceListAnatomy.list}>
          <AnimatePresence initial={false}>
            {personalities.map((personality) => (
              <CompactStyleRow
                key={personality.id}
                personality={personality}
                onSelect={() => actions.selectPersonality(personality.id)}
                onToggle={() =>
                  actions.patchPersonality(personality.id, {
                    enabled: !personality.enabled,
                  })
                }
                onEdit={() => actions.editPersonality(personality.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {selected ? (
        <section className="mt-5 border-t border-border-primary pt-5">
          <h2 className="ui-text-title-strong ui-color-primary">
            {selected.name}
          </h2>
          <StylePreview personality={selected} fallback={example} />
        </section>
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
          onDelete={() => actions.deletePersonality(activePersonality.id)}
        />
      ) : null}
    </div>
  );
}

function StudioCleanupLevel({ isActive }: { isActive: boolean }) {
  const { t } = useLingui();
  const cleanupQuery = useSettings(
    (settings) => ({
      enabled:
        settings.shortcut_bindings.smart[0]?.cleanup_enabled ??
        settings.cleanup_enabled,
      shortcut:
        settings.shortcut_bindings.smart[0]?.shortcut ??
        settings.smart_shortcut,
    }),
    isActive,
  );
  const cleanup = cleanupQuery.data;

  return (
    <section className="border-b border-border-primary py-[18px]">
      <h3 className="ui-text-title-strong ui-color-primary">
        {t({ id: "voice.writing.cleanup_title", message: "Cleanup level" })}
      </h3>
      <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
        {t({
          id: "voice.writing.cleanup_description",
          message:
            "This reflects the cleanup behavior saved for your primary dictation shortcut.",
        })}
      </p>
      {cleanupQuery.isLoading ? (
        <p className="mt-3 ui-text-body-sm ui-color-muted" role="status">
          {t({ id: "voice.writing.cleanup_loading", message: "Loading…" })}
        </p>
      ) : cleanupQuery.error || !cleanup ? (
        <p className="mt-3 ui-text-body-sm ui-color-error-soft" role="status">
          {t({
            id: "voice.writing.cleanup_unavailable",
            message: "Cleanup settings are unavailable right now.",
          })}
        </p>
      ) : (
        <div
          className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-label={t({
            id: "voice.writing.cleanup_current",
            message: "Current cleanup behavior",
          })}
        >
          <CleanupStateCard
            active={!cleanup.enabled}
            activeLabel={t({
              id: "voice.writing.cleanup.active",
              message: "Active",
            })}
            label={t({
              id: "voice.writing.cleanup.original",
              message: "Original",
            })}
            detail={t({
              id: "voice.writing.cleanup.original_detail",
              message: "Insert the transcript without AI cleanup.",
            })}
          />
          <CleanupStateCard
            active={cleanup.enabled}
            activeLabel={t({
              id: "voice.writing.cleanup.active",
              message: "Active",
            })}
            label={t({
              id: "voice.writing.cleanup.enabled",
              message: "Clean up",
            })}
            detail={t({
              id: "voice.writing.cleanup.enabled_detail",
              message: `Applied when you use ${cleanup.shortcut}.`,
            })}
          />
        </div>
      )}
    </section>
  );
}

function CleanupStateCard({
  active,
  activeLabel,
  label,
  detail,
}: {
  active: boolean;
  activeLabel: string;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={`rounded-[11px] border p-3 ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-10)]"
          : "border-border-primary bg-surface-surface"
      }`}
      data-active={active ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="ui-text-body-sm-strong ui-color-primary">
          {label}
        </strong>
        {active ? (
          <span className="ui-text-micro font-semibold text-[var(--color-accent)]">
            {activeLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-2 ui-text-meta ui-color-muted">{detail}</p>
    </div>
  );
}
