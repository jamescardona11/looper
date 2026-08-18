import { isRemoteSpeechConfigured } from "../../../../shared/lib/speechProviders";
import type {
  ModelStatus,
  RemoteSpeechProvider,
  TranscriptionMode,
} from "../../../../types";
import type { GeneralSection } from "./GeneralTab.types";

export function isGeneralSectionVisible(
  activeSection: GeneralSection | undefined,
  section: GeneralSection,
) {
  return activeSection === undefined || activeSection === section;
}

export function shouldWarnMissingLocalModel(args: {
  transcriptionMode: TranscriptionMode;
  localModel: string;
  localModelStatus?: ModelStatus;
  remoteSpeechEnabled: boolean;
  remoteSpeechProvider: RemoteSpeechProvider;
  remoteSpeechEndpoint: string;
  remoteSpeechModel: string;
}) {
  const remoteSpeechActive = isRemoteSpeechConfigured({
    enabled: args.remoteSpeechEnabled,
    provider: args.remoteSpeechProvider,
    endpoint: args.remoteSpeechEndpoint,
    model: args.remoteSpeechModel,
  });
  return (
    args.transcriptionMode === "local" &&
    !remoteSpeechActive &&
    args.localModel.length > 0 &&
    args.localModelStatus !== undefined &&
    !args.localModelStatus.installed
  );
}

export function aiFeatureAccess(
  ready: boolean,
  licenseActive: boolean,
): {
  disabled: boolean;
  settingsTarget: "account" | "providers" | null;
} {
  if (ready) return { disabled: false, settingsTarget: null };
  return {
    disabled: true,
    settingsTarget: licenseActive ? "providers" : "account",
  };
}
