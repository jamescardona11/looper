import type { Variants } from "framer-motion";
import type { useSettingsForm } from "../../useSettingsForm";

export type GeneralSection =
  "processing" | "microphone" | "shortcuts" | "behavior";

type GeneralForm = ReturnType<typeof useSettingsForm>["tabs"]["general"];
type Scoped = { activeSection?: GeneralSection };
type SectionProps<Keys extends keyof GeneralForm> = Scoped &
  Pick<GeneralForm, Keys>;

export type GeneralFrameProps = Scoped & { variants: Variants };

export type GeneralProcessingProps = SectionProps<
  | "transcriptionMode"
  | "onTranscriptionModeChange"
  | "modelStatus"
  | "localModel"
  | "remoteSpeechEnabled"
  | "remoteSpeechProvider"
  | "remoteSpeechEndpoint"
  | "remoteSpeechModel"
> & { onOpenModelsTab: () => void };

export type GeneralInputProps = SectionProps<
  | "inputDevices"
  | "microphoneDevice"
  | "onMicrophoneDeviceChange"
  | "language"
  | "onLanguageChange"
  | "languages"
  | "languageGuidance"
>;

export type GeneralShortcutProps = SectionProps<
  | "smartEnabled"
  | "setSmartEnabled"
  | "holdEnabled"
  | "setHoldEnabled"
  | "toggleEnabled"
  | "setToggleEnabled"
  | "shortcutBindings"
  | "invalidShortcutDrafts"
  | "captureActive"
  | "capturePreview"
  | "onStartCapture"
  | "updateShortcutBinding"
  | "addShortcutBinding"
  | "removeShortcutBinding"
  | "aiFeaturesReady"
>;

export type GeneralFeatureProps = SectionProps<
  | "editModeEnabled"
  | "setEditModeEnabled"
  | "previewBeforeInsertEnabled"
  | "setPreviewBeforeInsertEnabled"
  | "previewBeforeInsertSelectionEnabled"
  | "setPreviewBeforeInsertSelectionEnabled"
  | "useScreenContext"
  | "setUseScreenContext"
  | "autoDictionaryEnabled"
  | "autoDictionarySupported"
  | "setAutoDictionaryEnabled"
  | "aiFeaturesReady"
  | "licenseGateActive"
> & {
  onOpenProvidersTab: () => void;
  onOpenAccountTab: () => void;
};

export type GeneralTabProps = GeneralFrameProps &
  GeneralForm & {
    onOpenModelsTab: () => void;
    onOpenProvidersTab: () => void;
    onOpenAccountTab: () => void;
  };
