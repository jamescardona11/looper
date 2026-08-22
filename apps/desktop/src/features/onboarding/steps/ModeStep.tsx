import { useLingui } from "@lingui/react/macro";
import { Cloud, LockKey } from "@phosphor-icons/react";
import type { TranscriptionMode } from "../../../contracts";
import {
  OnboardingHeader,
  OnboardingStep,
  PRIMARY_BUTTON_CLASS,
  type StepMotionProps,
} from "./shared";
import { ModeStepOption } from "./mode-step-option";

type ModeStepProps = {
  stepMotionProps: StepMotionProps;
  selectedMode: TranscriptionMode;
  localUnavailable: boolean;
  onSelect: (mode: TranscriptionMode) => void;
  onNext: () => void;
};

export function ModeStep({
  stepMotionProps,
  selectedMode,
  localUnavailable,
  onSelect,
  onNext,
}: ModeStepProps) {
  const { t } = useLingui();
  const localDescription = localUnavailable
    ? t({
        id: "onboarding.mode.local.unsupported",
        message: "Parakeet is not supported on this computer.",
      })
    : t({
        id: "onboarding.mode.local.description",
        message: "Private and offline. Downloads Parakeet to this computer.",
      });

  return (
    <OnboardingStep
      stepKey="mode"
      motionProps={stepMotionProps}
      footer={
        <button type="button" onClick={onNext} className={PRIMARY_BUTTON_CLASS}>
          {t({ id: "onboarding.mode.continue", message: "Continue" })}
        </button>
      }
    >
      <OnboardingHeader
        title={t({
          id: "onboarding.mode.title",
          message: "Where should Looper process your voice?",
        })}
        subtitle={t({
          id: "onboarding.mode.subtitle",
          message: "You can change this later in Settings.",
        })}
      />

      <div className="grid w-full grid-cols-2 gap-3" role="radiogroup">
        <ModeStepOption
          active={selectedMode === "local"}
          disabled={localUnavailable}
          tone="local"
          icon={<LockKey size={24} weight="duotone" />}
          title={t({ id: "onboarding.mode.local", message: "Local" })}
          badge={
            localUnavailable
              ? t({ id: "onboarding.mode.unavailable", message: "Unavailable" })
              : t({ id: "onboarding.mode.recommended", message: "Recommended" })
          }
          description={localDescription}
          onClick={() => onSelect("local")}
        />
        <ModeStepOption
          active={selectedMode === "cloud"}
          tone="cloud"
          icon={<Cloud size={24} weight="duotone" />}
          title={t({ id: "onboarding.mode.cloud", message: "Cloud" })}
          description={t({
            id: "onboarding.mode.cloud.description",
            message: "No download. Audio is sent securely to Looper Cloud.",
          })}
          onClick={() => onSelect("cloud")}
        />
      </div>
    </OnboardingStep>
  );
}
