export type TranscriptSegment = {
  start_ms: number;
  end_ms: number;
  text: string;
  speaker_id?: string | null;
};

export type Speaker = {
  id: string;
  name: string;
  color?: string | null;
};

export type LibraryItemKind = "import" | "recording" | "meeting";

export type LibraryItemStatus =
  | { type: "pending" }
  | { type: "recording" }
  | { type: "importing"; progress: number }
  | { type: "transcribing"; progress: number }
  | { type: "complete" }
  | { type: "cancelling" }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export type LibraryMedia = {
  audio_path: string;
  source_path: string;
  store_original: boolean;
  duration_seconds: number;
  file_size_bytes: number;
  original_format: string;
};

export type LibraryProcessing = {
  transcript?: string | null;
  segments?: TranscriptSegment[] | null;
  words?: TranscriptSegment[] | null;
  llm_cleanup_enabled: boolean;
  denoise_enabled: boolean;
  speech_model: string;
  show_timestamps: boolean;
  detect_speakers: boolean;
  speakers?: Speaker[] | null;
};

export type LibraryItem = LibraryMedia &
  LibraryProcessing & {
    id: string;
    name: string;
    status: LibraryItemStatus;
    created_at: string;
    transcribed_at?: string | null;
    tags: string[];
    kind: LibraryItemKind;
  };

export type LibraryItemsPage = {
  items: LibraryItem[];
  has_more: boolean;
};

export type LibraryFilter = {
  search?: string | null;
  status?: string | null;
  tag?: string | null;
  since_days?: number | null;
};

export type LibraryItemPatch = {
  name?: string | null;
  transcript?: string | null;
  segments?: TranscriptSegment[] | null;
  tags?: string[] | null;
  status?: LibraryItemStatus | null;
  llm_cleanup_enabled?: boolean | null;
  denoise_enabled?: boolean | null;
  speech_model?: string | null;
  transcribed_at?: string | null;
  show_timestamps?: boolean | null;
  detect_speakers?: boolean | null;
  duration_seconds?: number | null;
  kind?: LibraryItemKind | null;
  speakers?: Speaker[] | null;
};

export type LibraryTranslation = {
  item_id: string;
  language: string;
  text: string;
  model: string;
  created_at: string;
};
