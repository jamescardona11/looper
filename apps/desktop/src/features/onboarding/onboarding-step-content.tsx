import type { ComponentProps } from "react";
import { ImportStep as ImportSettingsStep } from "../import/components/ImportStep";
import { IntelligenceStep as MeetingIntelligenceStep } from "./steps/IntelligenceStep";
import { ModeStep as TranscriptionModeStep } from "./steps/ModeStep";
import { ModelStep as SpeechModelStep } from "./steps/ModelStep";
import { PermissionsStep as SystemPermissionsStep } from "./steps/PermissionsStep";
import { ReadyStep as CompletionStep } from "./steps/ReadyStep";
import { WelcomeStep as IntroductionStep } from "./steps/WelcomeStep";

export type OnboardingStepViews = {
  welcome: ComponentProps<typeof IntroductionStep>;
  mode: ComponentProps<typeof TranscriptionModeStep>;
  model: ComponentProps<typeof SpeechModelStep>;
  import: ComponentProps<typeof ImportSettingsStep>;
  intelligence: ComponentProps<typeof MeetingIntelligenceStep>;
  permissions: ComponentProps<typeof SystemPermissionsStep>;
  done: ComponentProps<typeof CompletionStep>;
};

export function renderOnboardingStep(
  current: string,
  views: OnboardingStepViews,
) {
  switch (current) {
    case "welcome":
      return <IntroductionStep key={current} {...views.welcome} />;
    case "mode":
      return <TranscriptionModeStep key={current} {...views.mode} />;
    case "model":
      return <SpeechModelStep key={current} {...views.model} />;
    case "import":
      return <ImportSettingsStep key={current} {...views.import} />;
    case "intelligence":
      return <MeetingIntelligenceStep key={current} {...views.intelligence} />;
    case "permissions":
      return <SystemPermissionsStep key={current} {...views.permissions} />;
    case "done":
      return <CompletionStep key={current} {...views.done} />;
    default:
      return null;
  }
}
