import type { Variants } from "framer-motion";
import type { TranscriptionLanguageOption } from "../../../../shared/lib/transcriptionLanguages";
import type {
  DeviceInfo,
  ModelStatus,
  RemoteSpeechProvider,
  ShortcutBinding,
  ShortcutBindings,
  TranscriptionMode,
} from "../../../../types";
import type {
  CaptureMode,
  InvalidShortcutDrafts,
  ShortcutMode,
} from "./GeneralShortcuts";

export type GeneralSection =
  "processing" | "microphone" | "shortcuts" | "behavior";

export type GeneralFrameProps = {
  activeSection?: GeneralSection;
  variants: Variants;
};

export type GeneralProcessingProps = {
  activeSection?: GeneralSection;
  transcriptionMode: TranscriptionMode;
  onTranscriptionModeChange: (mode: TranscriptionMode) => void;
  modelStatus: Record<string, ModelStatus>;
  localModel: string;
  remoteSpeechEnabled: boolean;
  remoteSpeechProvider: RemoteSpeechProvider;
  remoteSpeechEndpoint: string;
  remoteSpeechModel: string;
  onOpenModelsTab: () => void;
};

export type GeneralInputProps = {
  activeSection?: GeneralSection;
  inputDevices: DeviceInfo[];
  microphoneDevice: string | null;
  onMicrophoneDeviceChange: (deviceId: string | null) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  languages: TranscriptionLanguageOption[];
  languageGuidance: string;
};

export type GeneralShortcutProps = {
  activeSection?: GeneralSection;
  smartEnabled: boolean;
  setSmartEnabled: (value: boolean) => void;
  holdEnabled: boolean;
  setHoldEnabled: (value: boolean) => void;
  toggleEnabled: boolean;
  setToggleEnabled: (value: boolean) => void;
  shortcutBindings: ShortcutBindings;
  invalidShortcutDrafts: InvalidShortcutDrafts;
  captureActive: CaptureMode;
  capturePreview: string;
  onStartCapture: (mode: ShortcutMode, index?: number) => void;
  updateShortcutBinding: (
    mode: ShortcutMode,
    index: number,
    patch: Partial<ShortcutBinding>,
  ) => void;
  addShortcutBinding: (mode: ShortcutMode) => void;
  removeShortcutBinding: (mode: ShortcutMode, index: number) => void;
  aiFeaturesReady: boolean;
};

export type GeneralFeatureProps = {
  activeSection?: GeneralSection;
  editModeEnabled: boolean;
  setEditModeEnabled: (value: boolean) => void;
  previewBeforeInsertEnabled: boolean;
  setPreviewBeforeInsertEnabled: (value: boolean) => void;
  previewBeforeInsertSelectionEnabled: boolean;
  setPreviewBeforeInsertSelectionEnabled: (value: boolean) => void;
  useScreenContext: boolean;
  setUseScreenContext: (value: boolean) => void;
  autoDictionaryEnabled: boolean;
  autoDictionarySupported: boolean;
  setAutoDictionaryEnabled: (value: boolean) => void;
  aiFeaturesReady: boolean;
  licenseGateActive: boolean;
  onOpenProvidersTab: () => void;
  onOpenAccountTab: () => void;
};

export type GeneralTabProps = GeneralFrameProps &
  GeneralProcessingProps &
  GeneralInputProps &
  GeneralShortcutProps &
  GeneralFeatureProps;
