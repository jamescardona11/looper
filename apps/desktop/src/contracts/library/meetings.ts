export type MeetingStartOptions = {
  model_key: string;
  live_model_key?: string | null;
  system_audio_enabled: boolean;
  calendar_context?: MeetingCalendarContext | null;
};

export type CaptureIntent = "meeting" | "voice_note";

export type MeetingCalendarContext = {
  provider: string;
  event_id: string;
  external_id: string;
  calendar_id: string;
  series_id?: string | null;
  occurrence_id?: string | null;
  title: string;
  meeting_url?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  organizer?: string | null;
  attendee_count: number;
};

export type MeetingCapturePhase =
  "idle" | "starting" | "recording" | "finalizing" | "processing" | "error";

export type MeetingCaptureHealth = {
  status: "healthy" | "delayed" | "degraded";
  audio_lag_ms: number;
  last_audio_at?: string | null;
  last_transcript_at?: string | null;
};

export type MeetingCaptureState = {
  phase: MeetingCapturePhase;
  id?: string | null;
  started_at?: string | null;
  elapsed_seconds: number;
  system_audio_enabled: boolean;
  capture_intent: CaptureIntent;
  warning?: string | null;
  error?: string | null;
  last_note_marker?: MeetingNoteMarker | null;
  active_note_selection?: MeetingNoteSelection | null;
  active_important_moment?: MeetingImportantMoment | null;
  live_transcript: string;
  capture_health: MeetingCaptureHealth;
};

export type MeetingNoteSelection = {
  started_at: string;
  anchor_ms: number;
  initial_duration_ms: number;
  hold_step_ms: number;
  duration_step_ms: number;
  max_duration_ms: number;
};

export type MeetingImportantMoment = {
  started_at: string;
  start_ms: number;
};

export type MeetingNoteKind = "retrospective" | "important_moment";

export type MeetingNoteMarker = {
  id: string;
  captured_at_ms: number;
  start_ms: number;
  end_ms: number;
  created_at: string;
  kind?: MeetingNoteKind;
};

export type MeetingSummaryStatus = "idle" | "running" | "complete" | "error";

export type MeetingDetails = {
  library_item_id: string;
  started_at: string;
  ended_at?: string | null;
  notes: string;
  notes_revision: number;
  summary?: string | null;
  summary_status: MeetingSummaryStatus;
  summary_error?: string | null;
  system_audio_enabled: boolean;
  recovered: boolean;
  calendar_context?: MeetingCalendarContext | null;
  note_markers: MeetingNoteMarker[];
  live_transcript: MeetingTranscriptSegment[];
};

export type MeetingTranscriptSource = "you" | "them";

export type MeetingTranscriptSegment = {
  id: string;
  source: MeetingTranscriptSource;
  text: string;
  start_ms: number;
  end_ms: number;
};

export type MeetingTranscriptUpdate = {
  id: string;
  meeting_id: string;
  source: MeetingTranscriptSource;
  text: string;
  start_ms: number;
  end_ms: number;
  is_final: boolean;
};

export type MeetingNotesUpdate = {
  notes: string;
  expected_revision: number;
};
