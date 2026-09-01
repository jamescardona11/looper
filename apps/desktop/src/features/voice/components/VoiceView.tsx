import { useLingui } from "@lingui/react/macro";
import { useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";

import DictionaryView from "../../dictionary/components/DictionaryView";
import PersonalizationView from "../../personalization/components/PersonalizationView";
import ModeRulesSection from "../../personalization/components/ModeRulesSection";
import { useInstalledApps } from "../../personalization/queries";

// Voice reúne todo lo que el usuario le enseña a Looper, en el orden en que
// ocurre: primero te oye (Vocabulary), luego decide cómo escribirlo (Styles),
// y al final aplica reglas mecánicas (Rules, Snippets).
type VoiceStep = "vocabulary" | "styles" | "building-blocks" | "automations";

const STEPS: VoiceStep[] = [
  "vocabulary",
  "styles",
  "building-blocks",
  "automations",
];

const VoiceView = ({ isActive = true }: { isActive?: boolean }) => {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<VoiceStep>("vocabulary");
  const panelRef = useRef<HTMLDivElement>(null);
  const { data: installedApps = [] } = useInstalledApps(
    isActive && step === "automations",
  );
  const stepLabel = (voiceStep: VoiceStep) => {
    switch (voiceStep) {
      case "vocabulary":
        return t({ id: "voice.step.vocabulary", message: "Words" });
      case "styles":
        return t({ id: "voice.step.styles", message: "Writing" });
      case "building-blocks":
        return t({
          id: "voice.step.building_blocks",
          message: "Building blocks",
        });
      case "automations":
        return t({ id: "voice.step.automations", message: "Flows" });
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 max-w-5xl flex-col px-0 text-left">
      <header className="shrink-0">
        <p className="ui-text-uppercase-micro ui-color-accent">
          {t({ id: "voice.eyebrow", message: "Studio" })}
        </p>
        <h1 className="mt-1 font-display ui-text-screen-title font-semibold tracking-normal ui-color-primary">
          {t({ id: "voice.title", message: "Shape how Looper writes." })}
        </h1>

        <nav
          role="tablist"
          className="mt-[22px] flex w-fit max-w-full items-center gap-[3px] overflow-x-auto rounded-[15px] bg-[var(--desktop-workspace)] p-1"
          aria-label={t({ id: "voice.steps", message: "Voice sections" })}
        >
          {STEPS.map((id, index) => (
            <div key={id} className="relative flex items-center">
              <button
                type="button"
                role="tab"
                id={`voice-tab-${id}`}
                aria-controls="voice-tabpanel"
                aria-selected={step === id}
                onClick={() => setStep(id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                    return;
                  }
                  event.preventDefault();
                  const direction = event.key === "ArrowRight" ? 1 : -1;
                  const nextIndex =
                    (index + direction + STEPS.length) % STEPS.length;
                  const nextStep = STEPS[nextIndex];
                  setStep(nextStep);
                  document.getElementById(`voice-tab-${nextStep}`)?.focus();
                }}
                className={`relative flex h-9 items-center rounded-[11px] px-[13px] ui-text-body-sm ${
                  reduceMotion ? "transition-none" : "transition-colors"
                } ${
                  step === id
                    ? "bg-[var(--color-text-primary)] font-semibold text-white"
                    : "ui-color-muted hover:bg-[var(--surface-interactive-strong)] hover:text-content-primary"
                }`}
              >
                {stepLabel(id)}
              </button>
            </div>
          ))}
        </nav>
      </header>

      <div
        ref={panelRef}
        id="voice-tabpanel"
        role="tabpanel"
        aria-labelledby={`voice-tab-${step}`}
        className="mt-[22px] min-h-0 w-full max-w-[790px] flex-1 overflow-y-auto pb-6"
      >
        {step === "automations" ? (
          <ModeRulesSection
            isActive={isActive && step === "automations"}
            installedApps={installedApps}
            compact
          />
        ) : step === "styles" ? (
          <PersonalizationView
            isActive={isActive && step === "styles"}
            embedded
            showModeRules={false}
            studio
          />
        ) : step === "building-blocks" ? (
          <>
            <StudioSectionHeader
              title={t({
                id: "voice.building_blocks.title",
                message: "Reusable blocks",
              })}
              description={t({
                id: "voice.building_blocks.description",
                message:
                  "Keep quick replacements separate from longer spoken templates.",
              })}
              actionLabel={t({
                id: "voice.building_blocks.new",
                message: "New block",
              })}
              onAction={() =>
                panelRef.current
                  ?.querySelector<HTMLInputElement>(
                    '[data-studio-focus="block"]',
                  )
                  ?.focus()
              }
            />
            <DictionaryView
              isActive={isActive && step === "building-blocks"}
              embedded
              section="building-blocks"
            />
          </>
        ) : (
          <>
            <StudioSectionHeader
              title={t({
                id: "voice.words.title",
                message: "Words Looper should get right",
              })}
              description={t({
                id: "voice.words.description",
                message:
                  "Keep vocabulary and review correction suggestions in one place.",
              })}
              actionLabel={t({
                id: "voice.words.add",
                message: "Add word",
              })}
              onAction={() =>
                panelRef.current
                  ?.querySelector<HTMLInputElement>(
                    '[data-studio-focus="word"]',
                  )
                  ?.focus()
              }
            />
            <DictionaryView isActive={isActive} embedded section="words" />
          </>
        )}
      </div>
    </div>
  );
};

function StudioSectionHeader({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="mb-[18px] flex items-start justify-between gap-[18px] border-b border-border-primary pb-4">
      <div className="min-w-0">
        <h2 className="ui-text-title-strong ui-color-primary text-balance">
          {title}
        </h2>
        <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
          {description}
        </p>
      </div>
      <button
        className="h-9 shrink-0 rounded-[11px] bg-[var(--color-accent)] px-4 ui-text-button font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default VoiceView;
