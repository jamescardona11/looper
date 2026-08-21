import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import SectionLabel from "../../../shared/ui/SectionLabel";
import type { GeneralProcessingProps } from "./GeneralTab.types";
import {
  isGeneralSectionVisible,
  shouldWarnMissingLocalModel,
} from "./general-settings-model";

export function GeneralProcessingSection(props: GeneralProcessingProps) {
  const { t } = useLingui();
  const choices = processingChoices(t, props.transcriptionMode);
  const missingLocalModel = shouldWarnMissingLocalModel({
    transcriptionMode: props.transcriptionMode,
    localModel: props.localModel,
    localModelStatus: props.localModel
      ? props.modelStatus[props.localModel]
      : undefined,
    remoteSpeechEnabled: props.remoteSpeechEnabled,
    remoteSpeechProvider: props.remoteSpeechProvider,
    remoteSpeechEndpoint: props.remoteSpeechEndpoint,
    remoteSpeechModel: props.remoteSpeechModel,
  });

  return (
    <section
      data-settings-section="processing"
      className={
        isGeneralSectionVisible(props.activeSection, "processing")
          ? "space-y-2"
          : "hidden"
      }
    >
      <SectionLabel
        trailing={
          <button
            type="button"
            onClick={props.onOpenModelsTab}
            className="ui-text-meta ui-color-muted transition-colors hover:text-content-primary"
          >
            {t({
              id: "settings.general.manage_models",
              message: "Manage models",
            })}
          </button>
        }
      >
        {t({ id: "settings.general.processing", message: "Processing" })}
      </SectionLabel>

      <div
        className="grid grid-cols-2 gap-3"
        role="radiogroup"
        aria-label={t({
          id: "settings.general.processing_mode",
          message: "Processing Mode",
        })}
      >
        {choices.map(({ mode, ...choice }) => (
          <ProcessingChoice
            key={mode}
            {...choice}
            onSelect={() => props.onTranscriptionModeChange(mode)}
          />
        ))}
      </div>

      <AnimatePresence>
        {missingLocalModel && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ui-text-label ui-color-warning"
          >
            {t({
              id: "settings.general.no_model",
              message: "No model installed.",
            })}{" "}
            <button
              type="button"
              onClick={props.onOpenModelsTab}
              className="underline transition-colors hover:text-cloud"
            >
              {t({
                id: "settings.general.download_one",
                message: "Download one",
              })}
            </button>{" "}
            {t({
              id: "settings.general.to_use_local",
              message: "to use local.",
            })}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

type ProcessingChoiceProps = {
  mode: "cloud" | "local";
  selected: boolean;
  tone: "cloud" | "local";
  label: string;
  badge: string;
  description: string;
  accessibleLabel?: string;
  onSelect: () => void;
};

function ProcessingChoice({
  selected,
  tone,
  label,
  badge,
  description,
  accessibleLabel,
  onSelect,
}: Omit<ProcessingChoiceProps, "mode">) {
  const selectedClass =
    tone === "cloud"
      ? "border-cloud-30 bg-cloud-5 shadow-[var(--shadow-action-card-cloud-selected)]"
      : "border-local-30 bg-local-5 shadow-[var(--shadow-action-card-local-selected)]";
  const restClass =
    tone === "cloud"
      ? "border-border-primary bg-surface-surface shadow-[var(--shadow-action-card-rest)] hover:border-cloud-30 hover:bg-cloud-5"
      : "border-border-primary bg-surface-surface shadow-[var(--shadow-action-card-rest)] hover:border-local-30 hover:bg-local-5 hover:shadow-[var(--shadow-action-card-local-hover)]";
  const activeTone = tone === "cloud" ? "ui-color-cloud" : "ui-color-local";
  const detailTone = tone === "cloud" ? "text-cloud-50" : "text-local-50";

  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      aria-label={accessibleLabel}
      className={`rounded-lg border px-3.5 py-3 text-left transition-[box-shadow,border-color,background-color] duration-100 active:translate-y-[2px] active:shadow-none motion-reduce:transition-none ${
        selected ? selectedClass : restClass
      }`}
    >
      <span className="flex items-baseline gap-1.5">
        <span
          className={`ui-text-body-strong ${
            selected ? activeTone : "ui-color-secondary"
          }`}
        >
          {label}
        </span>
        <span
          className={`ui-text-label ${
            selected ? detailTone : "ui-color-disabled"
          }`}
        >
          {badge}
        </span>
      </span>
      <span
        className={`mt-1 block ui-text-label ${
          selected ? detailTone : "ui-color-disabled"
        }`}
      >
        {description}
      </span>
    </button>
  );
}

function processingChoices(
  t: ReturnType<typeof useLingui>["t"],
  selectedMode: GeneralProcessingProps["transcriptionMode"],
): Omit<ProcessingChoiceProps, "onSelect">[] {
  return [
    {
      mode: "cloud",
      selected: selectedMode === "cloud",
      tone: "cloud",
      label: t({ id: "settings.general.cloud.label", message: "Cloud" }),
      badge: t({ id: "settings.general.cloud.badge", message: "fast" }),
      description: t({
        id: "settings.general.cloud.description",
        message: "Uses Looper Cloud",
      }),
      accessibleLabel: t({
        id: "settings.general.cloud.aria",
        message: "Cloud processing",
      }),
    },
    {
      mode: "local",
      selected: selectedMode === "local",
      tone: "local",
      label: t({ id: "settings.general.local.label", message: "Local" }),
      badge: t({ id: "settings.general.local.badge", message: "private" }),
      description: t({
        id: "settings.general.local.description",
        message: "Runs entirely on your device",
      }),
    },
  ];
}
