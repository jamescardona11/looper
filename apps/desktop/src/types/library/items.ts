type Fields<Key extends PropertyKey, Value> = Record<Key, Value>;
type OptionalFields<Key extends PropertyKey, Value> = Partial<
  Fields<Key, Value>
>;

export type TranscriptSegment = Fields<"start_ms" | "end_ms", number> &
  Fields<"text", string> &
  OptionalFields<"speaker_id", string | null>;

export type Speaker = Fields<"id" | "name", string> &
  OptionalFields<"color", string | null>;

type LibraryKinds = ["import", "recording", "meeting"];
export type LibraryItemKind = LibraryKinds[number];

type LibraryStatusByType = {
  pending: Fields<"type", "pending">;
  recording: Fields<"type", "recording">;
  importing: Fields<"type", "importing"> & Fields<"progress", number>;
  transcribing: Fields<"type", "transcribing"> & Fields<"progress", number>;
  complete: Fields<"type", "complete">;
  cancelling: Fields<"type", "cancelling">;
  cancelled: Fields<"type", "cancelled">;
  error: Fields<"type", "error"> & Fields<"message", string>;
};
export type LibraryItemStatus = LibraryStatusByType[keyof LibraryStatusByType];

export type LibraryMedia = Fields<
  "audio_path" | "source_path" | "original_format",
  string
> &
  Fields<"store_original", boolean> &
  Fields<"duration_seconds" | "file_size_bytes", number>;

export type LibraryProcessing = OptionalFields<"transcript", string | null> &
  OptionalFields<"segments" | "words", TranscriptSegment[] | null> &
  Fields<
    | "llm_cleanup_enabled"
    | "denoise_enabled"
    | "show_timestamps"
    | "detect_speakers",
    boolean
  > &
  Fields<"speech_model", string> &
  OptionalFields<"speakers", Speaker[] | null>;

type LibraryIdentity = Fields<"id" | "name" | "created_at", string> &
  OptionalFields<"transcribed_at", string | null> &
  Fields<"tags", string[]> &
  Fields<"kind", LibraryItemKind> &
  Fields<"status", LibraryItemStatus>;

export type LibraryItem = LibraryMedia & LibraryProcessing & LibraryIdentity;

export type LibraryItemsPage = Fields<"items", LibraryItem[]> &
  Fields<"has_more", boolean>;

export type LibraryFilter = OptionalFields<
  "search" | "status" | "tag",
  string | null
> &
  OptionalFields<"since_days", number | null>;

export type LibraryItemPatch = OptionalFields<
  "name" | "transcript" | "speech_model" | "transcribed_at",
  string | null
> &
  OptionalFields<"segments", TranscriptSegment[] | null> &
  OptionalFields<"tags", string[] | null> &
  OptionalFields<"status", LibraryItemStatus | null> &
  OptionalFields<
    | "llm_cleanup_enabled"
    | "denoise_enabled"
    | "show_timestamps"
    | "detect_speakers",
    boolean | null
  > &
  OptionalFields<"duration_seconds", number | null> &
  OptionalFields<"kind", LibraryItemKind | null> &
  OptionalFields<"speakers", Speaker[] | null>;

export type LibraryTranslation = Fields<
  "item_id" | "language" | "text" | "model" | "created_at",
  string
>;
