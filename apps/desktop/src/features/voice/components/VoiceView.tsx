import { useLingui } from "@lingui/react/macro";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import DictionaryView from "../../dictionary/components/DictionaryView";
import PersonalizationView from "../../personalization/components/PersonalizationView";
import ModeRulesSection from "../../personalization/components/ModeRulesSection";
import { useInstalledApps } from "../../personalization/queries";

// Studio reúne lo que la persona puede enseñar explícitamente a Looper. Los
// nombres describen el resultado, no la implementación interna de cada lista.
type VoiceStep = "vocabulary" | "styles" | "rules" | "snippets" | "automations";

const STEPS: VoiceStep[] = [
  "vocabulary",
  "styles",
  "rules",
  "snippets",
  "automations",
];

const VoiceView = ({ isActive = true }: { isActive?: boolean }) => {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<VoiceStep>("vocabulary");
  const { data: installedApps = [] } = useInstalledApps(
    isActive && step === "automations",
  );
  const stepLabel = (voiceStep: VoiceStep) => {
    switch (voiceStep) {
      case "vocabulary":
        return t({ id: "studio.step.words", message: "Words" });
      case "styles":
        return t({ id: "studio.step.writing", message: "Writing" });
      case "rules":
        return t({ id: "studio.step.corrections", message: "Corrections" });
      case "snippets":
        return t({ id: "studio.step.blocks", message: "Building blocks" });
      case "automations":
        return t({ id: "studio.step.flows", message: "Flows" });
    }
  };

  return (
    <div className="mx-auto flex h-full w-full min-w-0 max-w-[760px] flex-col px-0 pt-8 text-left">
      <header className="shrink-0">
        <h1 className="ui-text-display ui-color-primary">
          {t({ id: "studio.title", message: "Shape how Looper writes." })}
        </h1>
        <p className="mt-1.5 max-w-xl ui-text-body ui-color-muted">
          {t({
            id: "studio.description",
            message:
              "Words, writing rules, reusable building blocks, and context-aware flows — all in one place.",
          })}
        </p>

        <nav
          role="tablist"
          className="mt-5 flex items-center gap-1 border-b border-border-primary"
          aria-label={t({ id: "studio.sections", message: "Studio sections" })}
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
                className={`relative flex h-10 items-center px-3 ui-text-body-sm transition-colors ${
                  step === id
                    ? "font-semibold ui-color-primary"
                    : "ui-color-muted hover:text-content-primary"
                }`}
              >
                {stepLabel(id)}
                {step === id ? (
                  <motion.span
                    layoutId="voice-active-tab"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }
                    }
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </div>
          ))}
        </nav>
      </header>

      <div
        id="voice-tabpanel"
        role="tabpanel"
        aria-labelledby={`voice-tab-${step}`}
        className="mt-5 min-h-0 max-w-4xl flex-1 overflow-y-auto pb-6"
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
          />
        ) : (
          <DictionaryView
            isActive={isActive}
            embedded
            section={step === "vocabulary" ? "vocabulary" : step}
          />
        )}
      </div>
    </div>
  );
};

export default VoiceView;
