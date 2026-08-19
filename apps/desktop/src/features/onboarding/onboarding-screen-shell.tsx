import { useLingui as useShellTranslations } from "@lingui/react/macro";
import { CaretLeft as BackIcon } from "@phosphor-icons/react";
import {
  AnimatePresence as Presence,
  MotionConfig as MotionPreferences,
} from "framer-motion";
import type { ReactNode } from "react";
import FAQModal from "../../shared/ui/FAQModal";
import WindowControls from "../../shared/ui/WindowControls";
import { StepIndicator } from "./steps/shared";

const SCREEN_CLASS_NAME =
  "onboarding-shell relative flex h-screen w-screen flex-col overflow-hidden bg-surface-secondary ui-color-on-solid select-none";
const CONTENT_CLASS_NAME =
  "onboarding-content relative z-10 flex flex-1 flex-col items-center overflow-y-auto px-10 pb-6";
const BACK_BUTTON_CLASS_NAME =
  "onboarding-back-button absolute bottom-6 left-6 z-20 flex items-center gap-1 ui-text-body-sm text-content-muted transition-colors hover:text-content-primary";

type OnboardingScreenShellProps = {
  currentStep: string;
  currentStepIndex: number;
  totalSteps: number;
  direction: 1 | -1;
  stepContent: ReactNode;
  bridges: ReactNode;
  onBack: () => void;
  faqOpen: boolean;
  onCloseFaq: () => void;
  licenseModal: ReactNode;
};

export function OnboardingScreenShell(props: OnboardingScreenShellProps) {
  const { t } = useShellTranslations();
  const progressVisible =
    props.currentStep !== "welcome" && props.currentStep !== "done";
  const backVisible = props.currentStep !== "welcome";

  return (
    <MotionPreferences reducedMotion="user">
      <div className={SCREEN_CLASS_NAME}>
        {props.bridges}
        <div aria-hidden="true" className="onboarding-atmosphere">
          <span className="onboarding-atmosphere-orb onboarding-atmosphere-orb-primary" />
          <span className="onboarding-atmosphere-orb onboarding-atmosphere-orb-secondary" />
          <span className="onboarding-atmosphere-scanline" />
        </div>
        <WindowControls />
        <div
          data-tauri-drag-region
          className="relative z-10 h-7 w-full shrink-0"
        />

        <div className="relative z-10 flex justify-center pt-6">
          <div className="flex h-1.5 items-center">
            {progressVisible ? (
              <StepIndicator
                currentStep={props.currentStepIndex}
                total={props.totalSteps}
              />
            ) : null}
          </div>
        </div>

        <div className={CONTENT_CLASS_NAME}>
          <Presence mode="wait" custom={props.direction}>
            {props.stepContent}
          </Presence>
        </div>

        {backVisible ? (
          <button
            type="button"
            onClick={props.onBack}
            className={BACK_BUTTON_CLASS_NAME}
          >
            <BackIcon size={14} />
            {t({ id: "onboarding.back", message: "Back" })}
          </button>
        ) : null}

        <FAQModal isOpen={props.faqOpen} onClose={props.onCloseFaq} />

        <Presence>{props.licenseModal}</Presence>
      </div>
    </MotionPreferences>
  );
}
