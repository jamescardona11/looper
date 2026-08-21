import type { DropdownOption } from "../../../shared/ui/Dropdown";
import {
  hasModelCapability,
  MODEL_CAPABILITY_DIARIZATION,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../shared/lib/modelCapabilities";
import type { LibraryImportOptions, SpeechModel } from "../../../types";

export type ImportPreferences = {
  storeOriginal: boolean;
  denoiseEnabled: boolean;
  showTimestamps: boolean;
  detectSpeakers: boolean;
};

export type ImportModelSupport = {
  timestamps: boolean;
  diarization: boolean;
};

export const initialModelKey = (
  models: SpeechModel[],
  preferred?: string,
): string => preferred || models[0]?.id || "";

export const importModelOptions = (
  models: SpeechModel[],
  remoteProviderLabel: string,
): DropdownOption<string>[] =>
  models.map(({ id, label, description, remote }) => ({
    value: id,
    label,
    description: remote ? remoteProviderLabel : description,
  }));

export const importModelSupport = (
  models: SpeechModel[],
  selectedModelKey: string,
): ImportModelSupport => {
  const model = models.find(({ id }) => id === selectedModelKey);
  return {
    timestamps:
      Boolean(model?.remote) ||
      hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS),
    diarization: hasModelCapability(model, MODEL_CAPABILITY_DIARIZATION),
  };
};

export const constrainFilePreferences = (
  preferences: ImportPreferences,
  support: ImportModelSupport,
): ImportPreferences => {
  const showTimestamps = support.timestamps && preferences.showTimestamps;
  const detectSpeakers = support.diarization && preferences.detectSpeakers;
  if (
    showTimestamps === preferences.showTimestamps &&
    detectSpeakers === preferences.detectSpeakers
  ) {
    return preferences;
  }
  return { ...preferences, showTimestamps, detectSpeakers };
};

const optionsFrom = (
  modelKey: string,
  preferences: ImportPreferences,
  showTimestamps: boolean,
  detectSpeakers: boolean,
): LibraryImportOptions => ({
  store_original: preferences.storeOriginal,
  model_key: modelKey,
  llm_cleanup_enabled: false,
  denoise_enabled: preferences.denoiseEnabled,
  show_timestamps: showTimestamps,
  detect_speakers: detectSpeakers,
});

export const fileImportOptions = (
  modelKey: string,
  preferences: ImportPreferences,
  support: ImportModelSupport,
): LibraryImportOptions =>
  optionsFrom(
    modelKey,
    preferences,
    preferences.showTimestamps,
    support.diarization && preferences.detectSpeakers,
  );

export const youtubeImportOptions = (
  modelKey: string,
  preferences: ImportPreferences,
  support: ImportModelSupport,
): LibraryImportOptions =>
  optionsFrom(
    modelKey,
    preferences,
    support.timestamps && preferences.showTimestamps,
    support.diarization && preferences.detectSpeakers,
  );
