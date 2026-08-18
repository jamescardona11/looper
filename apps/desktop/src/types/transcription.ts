export type TranscriptionStatus = "success" | "error";

type TranscriptionTextFields = Record<
  "id" | "timestamp" | "text" | "audio_path" | "speech_model",
  string
>;
type TranscriptionFlags = Record<
  "audio_available" | "llm_cleaned" | "synced",
  boolean
>;
type TranscriptionMeasures = Record<
  "word_count" | "audio_duration_seconds",
  number
>;
type OptionalTranscriptionText = Partial<Record<"error_message", string>> &
  Partial<
    Record<
      "raw_text" | "llm_model" | "mode_id" | "mode_name" | "app_id",
      string | null
    >
  >;

export type TranscriptionRecord = TranscriptionTextFields &
  TranscriptionFlags &
  TranscriptionMeasures &
  OptionalTranscriptionText & {
    status: TranscriptionStatus;
  };

export type TodayDictationStats = Record<
  | "count"
  | "words"
  | "audioSeconds"
  | "longestWords"
  | "longestAudioSeconds"
  | "llmCleanedCount",
  number
>;
