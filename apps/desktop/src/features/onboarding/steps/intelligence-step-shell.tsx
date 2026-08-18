import type { ReactNode } from "react";
import {
  OnboardingHeader as StepHeading,
  OnboardingStep as StepFrame,
  type StepMotionProps as MotionSpec,
} from "./shared";

const INTELLIGENCE_STEP_KEY = "intelligence";
const INTELLIGENCE_TITLE = "Private meeting intelligence";
const INTELLIGENCE_SUBTITLE =
  "Summaries and questions stay on your device, including meetings in Spanish and Portuguese.";

type IntelligenceStepShellProps = {
  stepMotionProps: MotionSpec;
  footer: ReactNode;
  children: ReactNode;
};

export function IntelligenceStepShell({
  stepMotionProps,
  footer,
  children,
}: IntelligenceStepShellProps) {
  return (
    <StepFrame
      stepKey={INTELLIGENCE_STEP_KEY}
      motionProps={stepMotionProps}
      footer={footer}
    >
      <StepHeading title={INTELLIGENCE_TITLE} subtitle={INTELLIGENCE_SUBTITLE} />
      {children}
    </StepFrame>
  );
}
