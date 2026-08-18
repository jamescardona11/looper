import type { TranscriptSegment } from "./items";

export type LibraryImportOptions = {
  store_original: boolean;
  model_key: string;
  llm_cleanup_enabled: boolean;
  denoise_enabled: boolean;
  show_timestamps: boolean;
  detect_speakers: boolean;
};

export type LibraryWatchFolder = {
  path: string;
  options: LibraryImportOptions;
  enabled: boolean;
};

export type YoutubeImportMetadata = {
  url: string;
  video_id: string;
  title: string;
  channel: string | null;
  duration_seconds: number | null;
};

export type ExportFormat = "txt" | "md" | "srt" | "vtt";

export type LibraryProgressPayload = {
  id: string;
  progress: number;
  current_chunk: number;
  total_chunks: number;
  chunk_text?: string | null;
  chunk_segments?: TranscriptSegment[] | null;
};

export type LibraryImportProgressPayload = {
  id: string;
  progress: number;
};
