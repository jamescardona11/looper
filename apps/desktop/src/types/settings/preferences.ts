export type TranscriptionMode = "cloud" | "local";

export type MediaAction =
  "off" | "pause" | "duck10" | "duck25" | "duck50" | "duck75";

export type TextSizeMode = "small" | "default" | "large";
export type ThemeMode = "system" | "light" | "dark";
export type AppLocaleSetting = "system" | string;

export type RecordingPrunePolicy =
  "never" | "immediately" | "day" | "week" | "month" | "three_months" | "year";

export type AutoDeleteTarget = "audio" | "transcripts";
export type LlmProvider = string;
export type MeetingAiProvider = "local" | "writing" | "none";
export type RemoteSpeechProvider = string;
