import { AnimatePresence } from "framer-motion";
import { useLingui } from "@lingui/react/macro";
import type { Personality } from "../../../types";
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

type EmbeddedPersonalizationProps = {
  actions: PersonalizationViewActions;
  activePersonality: Personality | null;
  installedApps: InstalledApp[];
  personalities: Personality[];
  selectedPersonalityId: string | null;
  websiteIconBySite: Record<string, string>;
};

export function EmbeddedPersonalization({
  actions,
  activePersonality,
  installedApps,
  personalities,
  selectedPersonalityId,
  websiteIconBySite,
}: EmbeddedPersonalizationProps) {
  const { t } = useLingui();
  const selected = selectedPersonality(personalities, selectedPersonalityId);
  const example = selected ? styleExampleFor(selected.name, t) : null;

  return (
    <div className="min-w-0 text-left">
      <div className="flex items-center justify-between gap-4">
        <p className="ui-text-body-sm ui-color-muted">
          {t({
            id: "personalization.shared_list_description",
            message: "How Looper writes for you, per destination.",
          })}
        </p>
        <span className="shrink-0 ui-text-meta tabular-nums ui-color-muted">
          {personalities.length} of 20
        </span>
      </div>
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
