import { isRemoteSpeechConfigured } from "../../../../shared/lib/speechProviders";
import type {
  GeneralProcessingProps,
  GeneralSection,
} from "./GeneralTab.types";

export function isGeneralSectionVisible(
  activeSection: GeneralSection | undefined,
  section: GeneralSection,
) {
  return !activeSection || activeSection === section;
}

type ProcessingState = Pick<
  GeneralProcessingProps,
  | "transcriptionMode"
  | "localModel"
  | "remoteSpeechEnabled"
  | "remoteSpeechProvider"
  | "remoteSpeechEndpoint"
  | "remoteSpeechModel"
> & {
  localModelStatus?: GeneralProcessingProps["modelStatus"][string];
};

export function shouldWarnMissingLocalModel(state: ProcessingState) {
  const remoteReady = isRemoteSpeechConfigured({
    enabled: state.remoteSpeechEnabled,
    provider: state.remoteSpeechProvider,
    endpoint: state.remoteSpeechEndpoint,
    model: state.remoteSpeechModel,
  });
  const localRequired = state.transcriptionMode === "local" && !remoteReady;

  return Boolean(
    localRequired &&
    state.localModel &&
    state.localModelStatus &&
    !state.localModelStatus.installed,
  );
}

const enabledFeature = {
  disabled: false,
  settingsTarget: null,
} as const;

export function aiFeatureAccess(ready: boolean, licenseActive: boolean) {
  if (ready) return enabledFeature;
  return {
    disabled: true,
    settingsTarget: licenseActive
      ? ("providers" as const)
      : ("account" as const),
  };
}
