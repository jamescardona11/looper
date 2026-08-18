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
  "flex h-screen w-screen flex-col overflow-hidden bg-surface-secondary ui-color-on-solid select-none relative";
const CONTENT_CLASS_NAME =
  "flex-1 flex flex-col items-center overflow-y-auto px-10 pb-6";
const BACK_BUTTON_CLASS_NAME =
  "absolute left-6 bottom-6 flex items-center gap-1 ui-text-body-sm text-content-muted hover:text-content-primary transition-colors";

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
        <WindowControls />
        <div data-tauri-drag-region className="h-7 w-full shrink-0" />

        <div className="flex justify-center pt-6">
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
