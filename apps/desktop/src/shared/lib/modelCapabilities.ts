type ModelWithCapabilities = {
  capabilities?: readonly string[];
};

const CAPABILITY = {
  dictionary: "dictionary",
  timestamps: "timestamps",
  streaming: "streaming",
  diarization: "diarization",
} as const;

export const MODEL_CAPABILITY_DICTIONARY = CAPABILITY.dictionary;
export const MODEL_CAPABILITY_TIMESTAMPS = CAPABILITY.timestamps;
export const MODEL_CAPABILITY_STREAMING = CAPABILITY.streaming;
export const MODEL_CAPABILITY_DIARIZATION = CAPABILITY.diarization;

export function hasModelCapability(
  model: ModelWithCapabilities | null | undefined,
  capability: string,
): boolean {
  const expected = capability.toLocaleLowerCase();
  return (
    model?.capabilities?.some(
      (available) => available.toLocaleLowerCase() === expected,
    ) ?? false
  );
}
