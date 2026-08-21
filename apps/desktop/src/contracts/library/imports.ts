import type { TranscriptSegment } from "./items";

type Fields<Names extends PropertyKey, Value> = {
  [Field in Names]: Value;
};

type ImportToggle =
  | "store_original"
  | "llm_cleanup_enabled"
  | "denoise_enabled"
  | "show_timestamps"
  | "detect_speakers";

export type LibraryImportOptions = Fields<ImportToggle, boolean> &
  Fields<"model_key", string>;

export type LibraryWatchFolder = Fields<"path", string> &
  Fields<"enabled", boolean> &
  Fields<"options", LibraryImportOptions>;

export type YoutubeImportMetadata = Fields<
  "url" | "video_id" | "title",
  string
> &
  Fields<"channel", string | null> &
  Fields<"duration_seconds", number | null>;

type ExportFormatCatalog = {
  txt: unknown;
  md: unknown;
  srt: unknown;
  vtt: unknown;
};
export type ExportFormat = keyof ExportFormatCatalog;

type ProgressEnvelope<Details = object> = Fields<"id", string> &
  Fields<"progress", number> &
  Details;

type ChunkProgress = {
  current_chunk: number;
  total_chunks: number;
  chunk_text?: string | null;
  chunk_segments?: TranscriptSegment[] | null;
};

export type LibraryProgressPayload = ProgressEnvelope<ChunkProgress>;
export type LibraryImportProgressPayload = ProgressEnvelope;
