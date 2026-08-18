export type TranscriptionStatus = "success" | "error";

export interface TranscriptionRecord {
  id: string;
  timestamp: string;
  text: string;
  audio_path: string;
  audio_available: boolean;
  status: TranscriptionStatus;
  llm_cleaned: boolean;
  speech_model: string;
  word_count: number;
  audio_duration_seconds: number;
  synced: boolean;
  raw_text?: string | null;
  error_message?: string;
  llm_model?: string | null;
  mode_id?: string | null;
  mode_name?: string | null;
  app_id?: string | null;
}

export interface TodayDictationStats {
  count: number;
  words: number;
  audioSeconds: number;
  longestWords: number;
  longestAudioSeconds: number;
  llmCleanedCount: number;
}
