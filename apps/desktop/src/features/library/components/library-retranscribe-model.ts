import type { DropdownOption } from "../../../shared/ui/Dropdown";
import {
  hasModelCapability,
  MODEL_CAPABILITY_DIARIZATION,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../shared/lib/modelCapabilities";
import type { LibraryItem, SpeechModel } from "../../../types";

export type LibraryRetranscribeOptions = {
  model_key: string;
  show_timestamps: boolean;
  detect_speakers: boolean;
};

export type RetranscriptionCapabilities = {
  timestamps: boolean;
  diarization: boolean;
};

export function retranscribeModelOptions(
  models: SpeechModel[],
  remoteDescription: string,
): DropdownOption<string>[] {
  return models.map(({ id, label, description, remote }) => ({
    value: id,
    label,
    description: remote ? remoteDescription : description,
  }));
}

export function retranscriptionCapabilities(
  models: SpeechModel[],
  modelKey: string,
): RetranscriptionCapabilities {
  const model = models.find(({ id }) => id === modelKey);
  return {
    timestamps:
      Boolean(model?.remote) ||
      hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS),
    diarization: hasModelCapability(model, MODEL_CAPABILITY_DIARIZATION),
  };
}

export function initialRetranscriptionState(
  item: LibraryItem,
  models: SpeechModel[],
) {
  const savedModelAvailable = models.some(({ id }) => id === item.speech_model);
  const modelKey = savedModelAvailable
    ? item.speech_model
    : (models[0]?.id ?? "");
  const capabilities = retranscriptionCapabilities(models, modelKey);

  return {
    modelKey,
    showTimestamps:
      savedModelAvailable && capabilities.timestamps && item.show_timestamps,
    detectSpeakers:
      savedModelAvailable && capabilities.diarization && item.detect_speakers,
  };
}

export function retranscriptionSessionKey(
  item: LibraryItem,
  options: DropdownOption<string>[],
) {
  return JSON.stringify([
    item.id,
    item.speech_model,
    item.show_timestamps,
    item.detect_speakers,
    options,
  ]);
}

export function confirmedRetranscriptionOptions(
  modelKey: string,
  showTimestamps: boolean,
  detectSpeakers: boolean,
  capabilities: RetranscriptionCapabilities,
): LibraryRetranscribeOptions {
  return {
    model_key: modelKey,
    show_timestamps: capabilities.timestamps && showTimestamps,
    detect_speakers: capabilities.diarization && detectSpeakers,
  };
}
