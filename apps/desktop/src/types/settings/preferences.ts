type Choice<Tuple extends readonly string[]> = Tuple[number];

export type TranscriptionMode = Choice<["cloud", "local"]>;

export type MediaAction = Choice<
  ["off", "pause", "duck10", "duck25", "duck50", "duck75"]
>;

export type TextSizeMode = Choice<["small", "default", "large"]>;
export type ThemeMode = Choice<["system", "light", "dark"]>;
export type AppLocaleSetting = string;

export type RecordingPrunePolicy = Choice<
  ["never", "immediately", "day", "week", "month", "three_months", "year"]
>;

export type AutoDeleteTarget = Choice<["audio", "transcripts"]>;
type ProviderId = string;
export type LlmProvider = ProviderId;
export type MeetingAiProvider = Choice<["local", "writing", "none"]>;
export type RemoteSpeechProvider = ProviderId;
