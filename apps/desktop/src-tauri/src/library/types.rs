use serde::{Deserialize, Serialize};

macro_rules! wire_model {
    (
        $(#[$model_attribute:meta])*
        $visibility:vis $name:ident {
            $(
                $(#[$field_attribute:meta])*
                $field:ident: $field_type:ty
            ),* $(,)?
        }
    ) => {
        $(#[$model_attribute])*
        $visibility struct $name {
            $(
                $(#[$field_attribute])*
                pub $field: $field_type,
            )*
        }
    };
}

const AUDIO_EXTENSIONS: [&str; 6] = ["wav", "mp3", "m4a", "aac", "ogg", "flac"];
const VIDEO_EXTENSIONS: [&str; 4] = ["mp4", "mov", "webm", "mkv"];
const SECONDS_PER_MINUTE: u32 = 60;
const CANCELLATION_MESSAGE: &str = "Transcription cancelled";
const DEFAULT_TRANSCRIPTION_FAILURE: &str = "Transcription failed";
const UNKNOWN_STATUS_FAILURE: &str = "Unknown status";
const FFMPEG_FAILURE_MARKERS: [&str; 3] =
    ["ffmpeg not found", "install ffmpeg", "ffmpeg is required"];

pub(crate) const SUPPORTED_AUDIO_FORMATS: &[&str] = &AUDIO_EXTENSIONS;
pub(crate) const SUPPORTED_VIDEO_FORMATS: &[&str] = &VIDEO_EXTENSIONS;
pub(crate) const MAX_CHUNK_MINUTES: u32 =
    crate::speech::PARAKEET_CHUNK_SECONDS / SECONDS_PER_MINUTE;
pub(crate) const CHUNK_OVERLAP_SECONDS: u32 = 5_u32;
pub(crate) const DIRECT_TRANSCRIBE_MINUTES: u32 = MAX_CHUNK_MINUTES;
pub(crate) const TARGET_SAMPLE_RATE: u32 = 16 * 1_000;

#[derive(Debug, Default)]
pub(crate) struct Cancelled;

impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(CANCELLATION_MESSAGE)
    }
}

impl std::error::Error for Cancelled {}

pub(crate) fn cancelled_error() -> anyhow::Error {
    Cancelled.into()
}

pub(crate) fn is_cancelled_error(err: &anyhow::Error) -> bool {
    err.is::<Cancelled>()
}

pub(crate) fn is_ffmpeg_error_message(message: &str) -> bool {
    let normalized = message.to_lowercase();
    FFMPEG_FAILURE_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

macro_rules! event_names {
    ($($name:ident => $value:literal),+ $(,)?) => {
        $(pub const $name: &str = $value;)+
    };
}

event_names! {
    EVENT_LIBRARY_PROGRESS => "library:transcription_progress",
    EVENT_LIBRARY_COMPLETE => "library:transcription_complete",
    EVENT_LIBRARY_ERROR => "library:transcription_error",
    EVENT_LIBRARY_IMPORT_PROGRESS => "library:import_progress",
    EVENT_MEETING_CAPTURE_STATE => "meeting:capture_state",
    EVENT_MEETING_DETAILS_CHANGED => "meeting:details_changed",
    EVENT_MEETING_TRANSCRIPT_UPDATE => "meeting:transcript_update",
}

#[cfg(target_os = "macos")]
pub const EVENT_LIBRARY_OPEN_IMPORT: &str = "library:open_import";
#[cfg(target_os = "macos")]
pub const EVENT_LIBRARY_RENDERER_READY: &str = "library:renderer_ready";

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub TranscriptSegment {
        start_ms: u64,
        end_ms: u64,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speaker_id: Option<String>,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub Speaker {
        id: String,
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        color: Option<String>,
    }
}

pub(crate) fn default_item_kind() -> String {
    "import".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum LibraryItemStatus {
    Pending,
    Recording,
    Importing { progress: f32 },
    Transcribing { progress: f32 },
    Complete,
    Cancelling,
    Cancelled,
    Error { message: String },
}

impl LibraryItemStatus {
    pub fn as_fields(&self) -> (String, f32, Option<String>) {
        PersistedLibraryStatus::capture(self).into_columns()
    }

    pub fn from_fields(state_name: &str, progress: f32, failure: Option<String>) -> Self {
        PersistedLibraryStatus::restore(state_name, progress, failure)
    }
}

struct PersistedLibraryStatus {
    name: &'static str,
    progress: f32,
    failure: Option<String>,
}

impl PersistedLibraryStatus {
    fn capture(status: &LibraryItemStatus) -> Self {
        match status {
            LibraryItemStatus::Pending => Self::plain("pending", 0.0),
            LibraryItemStatus::Recording => Self::plain("recording", 0.0),
            LibraryItemStatus::Importing { progress } => Self::plain("importing", *progress),
            LibraryItemStatus::Transcribing { progress } => Self::plain("transcribing", *progress),
            LibraryItemStatus::Complete => Self::plain("complete", 1.0),
            LibraryItemStatus::Cancelling => Self::plain("cancelling", 0.0),
            LibraryItemStatus::Cancelled => Self::plain("cancelled", 0.0),
            LibraryItemStatus::Error { message } => Self {
                name: "error",
                progress: 0.0,
                failure: Some(message.clone()),
            },
        }
    }

    fn restore(name: &str, progress: f32, failure: Option<String>) -> LibraryItemStatus {
        match name {
            "pending" => LibraryItemStatus::Pending,
            "recording" => LibraryItemStatus::Recording,
            "importing" => LibraryItemStatus::Importing { progress },
            "transcribing" => LibraryItemStatus::Transcribing { progress },
            "complete" => LibraryItemStatus::Complete,
            "cancelling" => LibraryItemStatus::Cancelling,
            "cancelled" => LibraryItemStatus::Cancelled,
            "error" => LibraryItemStatus::Error {
                message: failure.unwrap_or_else(|| DEFAULT_TRANSCRIPTION_FAILURE.to_owned()),
            },
            _ => LibraryItemStatus::Error {
                message: UNKNOWN_STATUS_FAILURE.to_owned(),
            },
        }
    }

    fn plain(name: &'static str, progress: f32) -> Self {
        Self {
            name,
            progress,
            failure: None,
        }
    }

    fn into_columns(self) -> (String, f32, Option<String>) {
        (self.name.to_owned(), self.progress, self.failure)
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub LibraryItem {
        id: String,
        name: String,
        audio_path: String,
        source_path: String,
        store_original: bool,
        status: LibraryItemStatus,
        transcript: Option<String>,
        segments: Option<Vec<TranscriptSegment>>,
        words: Option<Vec<TranscriptSegment>>,
        duration_seconds: f32,
        file_size_bytes: u64,
        original_format: String,
        created_at: String,
        transcribed_at: Option<String>,
        tags: Vec<String>,
        llm_cleanup_enabled: bool,
        #[serde(default)]
        denoise_enabled: bool,
        speech_model: String,
        show_timestamps: bool,
        #[serde(default)]
        detect_speakers: bool,
        #[serde(default = "default_item_kind")]
        kind: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        speakers: Option<Vec<Speaker>>,
    }
}

/// Reuniones y notas se graban desde la app y comparten la misma superficie de
/// revisión: detalles de captura, resumen y chat. Lo que las separa es la fuente
/// de audio y el contexto de calendario, no lo que se puede hacer con ellas.
impl LibraryItem {
    pub(crate) fn is_capture(&self) -> bool {
        matches!(self.kind.as_str(), "meeting" | "recording")
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub LibraryTranslation {
        item_id: String,
        language: String,
        text: String,
        model: String,
        created_at: String,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub LibraryFilter {
        search: Option<String>,
        status: Option<String>,
        tag: Option<String>,
        since_days: Option<u32>,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub LibraryItemsPage {
        items: Vec<LibraryItem>,
        has_more: bool,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    pub LibraryItemPatch {
        name: Option<String>,
        audio_path: Option<String>,
        transcript: Option<String>,
        segments: Option<Vec<TranscriptSegment>>,
        words: Option<Vec<TranscriptSegment>>,
        tags: Option<Vec<String>>,
        status: Option<LibraryItemStatus>,
        llm_cleanup_enabled: Option<bool>,
        denoise_enabled: Option<bool>,
        speech_model: Option<String>,
        transcribed_at: Option<String>,
        show_timestamps: Option<bool>,
        detect_speakers: Option<bool>,
        duration_seconds: Option<f32>,
        file_size_bytes: Option<u64>,
        kind: Option<String>,
        speakers: Option<Option<Vec<Speaker>>>,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub MeetingStartOptions {
        model_key: String,
        #[serde(default)]
        live_model_key: Option<String>,
        #[serde(default = "default_true")]
        system_audio_enabled: bool,
        #[serde(default)]
        calendar_context: Option<MeetingCalendarContext>,
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureIntent {
    #[default]
    Meeting,
    VoiceNote,
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingCalendarContext {
        provider: String,
        event_id: String,
        external_id: String,
        calendar_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        series_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        occurrence_id: Option<String>,
        title: String,
        meeting_url: Option<String>,
        scheduled_start: String,
        scheduled_end: String,
        organizer: Option<String>,
        attendee_count: usize,
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MeetingCapturePhase {
    Idle,
    Starting,
    Recording,
    Finalizing,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MeetingCaptureHealthStatus {
    Healthy,
    Delayed,
    Degraded,
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingCaptureHealth {
        status: MeetingCaptureHealthStatus,
        #[serde(default)]
        audio_lag_ms: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        last_audio_at: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        last_transcript_at: Option<String>,
    }
}

impl Default for MeetingCaptureHealth {
    fn default() -> Self {
        Self {
            status: MeetingCaptureHealthStatus::Healthy,
            audio_lag_ms: 0,
            last_audio_at: None,
            last_transcript_at: None,
        }
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingCaptureState {
        phase: MeetingCapturePhase,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        started_at: Option<String>,
        #[serde(default)]
        elapsed_seconds: u64,
        #[serde(default)]
        system_audio_enabled: bool,
        #[serde(default)]
        capture_intent: CaptureIntent,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        warning: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        last_note_marker: Option<MeetingNoteMarker>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        active_note_selection: Option<MeetingNoteSelection>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        active_important_moment: Option<MeetingImportantMoment>,
        #[serde(default)]
        live_transcript: String,
        #[serde(default)]
        capture_health: MeetingCaptureHealth,
    }
}

impl Default for MeetingCaptureState {
    fn default() -> Self {
        Self {
            phase: MeetingCapturePhase::Idle,
            id: None,
            started_at: None,
            elapsed_seconds: 0,
            system_audio_enabled: false,
            capture_intent: CaptureIntent::Meeting,
            warning: None,
            error: None,
            last_note_marker: None,
            active_note_selection: None,
            active_important_moment: None,
            live_transcript: String::new(),
            capture_health: MeetingCaptureHealth::default(),
        }
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingNoteSelection {
        started_at: String,
        anchor_ms: u64,
        initial_duration_ms: u64,
        hold_step_ms: u64,
        duration_step_ms: u64,
        max_duration_ms: u64,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingImportantMoment {
        started_at: String,
        start_ms: u64,
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeetingNoteKind {
    #[default]
    Retrospective,
    ImportantMoment,
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingNoteMarker {
        id: String,
        captured_at_ms: u64,
        start_ms: u64,
        end_ms: u64,
        created_at: String,
        #[serde(default)]
        kind: MeetingNoteKind,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MeetingSummaryStatus {
    Idle,
    Running,
    Complete,
    Error,
}

impl MeetingSummaryStatus {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::Complete => "complete",
            Self::Error => "error",
        }
    }

    pub(crate) fn from_str(value: &str) -> Self {
        match value {
            "running" => Self::Running,
            "complete" => Self::Complete,
            "error" => Self::Error,
            _ => Self::Idle,
        }
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub MeetingDetails {
        library_item_id: String,
        started_at: String,
        ended_at: Option<String>,
        notes: String,
        notes_revision: u64,
        summary: Option<String>,
        summary_status: MeetingSummaryStatus,
        summary_error: Option<String>,
        system_audio_enabled: bool,
        recovered: bool,
        #[serde(default)]
        calendar_context: Option<MeetingCalendarContext>,
        #[serde(default)]
        note_markers: Vec<MeetingNoteMarker>,
        #[serde(default)]
        live_transcript: Vec<MeetingTranscriptSegment>,
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MeetingTranscriptSource {
    You,
    Them,
}

impl MeetingTranscriptSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::You => "you",
            Self::Them => "them",
        }
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
    pub MeetingTranscriptSegment {
        id: String,
        source: MeetingTranscriptSource,
        text: String,
        start_ms: u64,
        end_ms: u64,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub MeetingTranscriptUpdate {
        id: String,
        meeting_id: String,
        source: MeetingTranscriptSource,
        text: String,
        start_ms: u64,
        end_ms: u64,
        is_final: bool,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub MeetingNotesUpdate {
        notes: String,
        expected_revision: u64,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub LibraryImportOptions {
        store_original: bool,
        model_key: String,
        llm_cleanup_enabled: bool,
        #[serde(default)]
        denoise_enabled: bool,
        show_timestamps: bool,
        #[serde(default)]
        detect_speakers: bool,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub LibraryProgressPayload {
        id: String,
        progress: f32,
        current_chunk: u32,
        total_chunks: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        chunk_text: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        chunk_segments: Option<Vec<TranscriptSegment>>,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Txt,
    Md,
    Srt,
    Vtt,
}

wire_model! {
    #[derive(Debug, Clone)]
    pub(crate) LibraryProgressUpdate {
        progress: f32,
        current_chunk: u32,
        total_chunks: u32,
        transcript: Option<String>,
        segments: Option<Vec<TranscriptSegment>>,
        chunk_text: Option<String>,
        chunk_segments: Option<Vec<TranscriptSegment>>,
    }
}

impl LibraryProgressUpdate {
    pub fn with_chunk_counts(progress: f32, current_chunk: u32, total_chunks: u32) -> Self {
        Self {
            progress: progress.min(1.0),
            current_chunk: current_chunk.min(total_chunks),
            total_chunks,
            transcript: None,
            segments: None,
            chunk_text: None,
            chunk_segments: None,
        }
    }
}

wire_model! {
    #[derive(Debug)]
    pub(crate) LibraryTranscriptionResult {
        transcript: String,
        segments: Option<Vec<TranscriptSegment>>,
        words: Option<Vec<TranscriptSegment>>,
        speech_model: Option<String>,
        speakers: Option<Vec<Speaker>>,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize)]
    pub(crate) LibraryCompletePayload {
        id: String,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize)]
    pub(crate) LibraryErrorPayload {
        id: String,
        message: String,
        cancelled: bool,
    }
}

wire_model! {
    #[derive(Debug, Clone, Serialize)]
    pub(crate) LibraryImportProgressPayload {
        id: String,
        progress: f32,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn persisted_status_codec_round_trips_every_state_and_keeps_fallback_messages() {
        let states = [
            LibraryItemStatus::Pending,
            LibraryItemStatus::Recording,
            LibraryItemStatus::Importing { progress: 0.25 },
            LibraryItemStatus::Transcribing { progress: 0.75 },
            LibraryItemStatus::Complete,
            LibraryItemStatus::Cancelling,
            LibraryItemStatus::Cancelled,
            LibraryItemStatus::Error {
                message: "model unavailable".to_owned(),
            },
        ];

        for state in states {
            let columns = state.as_fields();
            let restored = LibraryItemStatus::from_fields(&columns.0, columns.1, columns.2.clone());
            assert_eq!(restored.as_fields(), columns);
        }

        let missing_error = LibraryItemStatus::from_fields("error", 0.0, None);
        assert_eq!(
            missing_error.as_fields().2.as_deref(),
            Some("Transcription failed")
        );
        let unknown = LibraryItemStatus::from_fields("future-state", 0.9, Some("ignored".into()));
        assert_eq!(unknown.as_fields().2.as_deref(), Some("Unknown status"));
    }

    #[test]
    fn library_wire_defaults_and_tagged_status_remain_compatible() {
        let item: LibraryItem = serde_json::from_value(json!({
            "id": "item-1",
            "name": "Interview",
            "audio_path": "/tmp/interview.wav",
            "source_path": "/tmp/source.wav",
            "store_original": true,
            "status": { "type": "pending" },
            "transcript": null,
            "segments": null,
            "words": null,
            "duration_seconds": 12.5,
            "file_size_bytes": 2048,
            "original_format": "wav",
            "created_at": "2026-08-17T12:00:00Z",
            "transcribed_at": null,
            "tags": ["research"],
            "llm_cleanup_enabled": false,
            "speech_model": "parakeet",
            "show_timestamps": true
        }))
        .unwrap();

        assert!(!item.denoise_enabled);
        assert!(!item.detect_speakers);
        assert_eq!(item.kind, "import");
        assert!(item.speakers.is_none());
        assert_eq!(
            serde_json::to_value(&item.status).unwrap(),
            json!({ "type": "pending" })
        );

        let progress = LibraryProgressPayload {
            id: item.id,
            progress: 0.5,
            current_chunk: 1,
            total_chunks: 2,
            chunk_text: None,
            chunk_segments: None,
        };
        let payload = serde_json::to_value(progress).unwrap();
        assert!(payload.get("chunk_text").is_none());
        assert!(payload.get("chunk_segments").is_none());
    }

    #[test]
    fn meeting_and_progress_defaults_keep_existing_behavior() {
        let options: MeetingStartOptions = serde_json::from_value(json!({
            "model_key": "parakeet"
        }))
        .unwrap();
        assert!(options.system_audio_enabled);
        assert!(options.live_model_key.is_none());
        assert!(options.calendar_context.is_none());

        let state = MeetingCaptureState::default();
        assert_eq!(state.phase, MeetingCapturePhase::Idle);
        assert_eq!(state.capture_intent, CaptureIntent::Meeting);
        assert_eq!(
            state.capture_health.status,
            MeetingCaptureHealthStatus::Healthy
        );

        let progress = LibraryProgressUpdate::with_chunk_counts(1.4, 9, 4);
        assert_eq!(progress.progress, 1.0);
        assert_eq!(progress.current_chunk, 4);
        assert_eq!(progress.total_chunks, 4);
        assert_eq!(
            serde_json::to_value(ExportFormat::Srt).unwrap(),
            json!("srt")
        );
        for (status, wire_name) in [
            (MeetingSummaryStatus::Idle, "idle"),
            (MeetingSummaryStatus::Running, "running"),
            (MeetingSummaryStatus::Complete, "complete"),
            (MeetingSummaryStatus::Error, "error"),
        ] {
            assert_eq!(status.as_str(), wire_name);
            assert_eq!(MeetingSummaryStatus::from_str(wire_name), status);
        }
        assert_eq!(
            MeetingSummaryStatus::from_str("future"),
            MeetingSummaryStatus::Idle
        );
        assert_eq!(MeetingTranscriptSource::You.as_str(), "you");
        assert_eq!(MeetingTranscriptSource::Them.as_str(), "them");
    }

    #[test]
    fn cancellation_and_ffmpeg_classification_keep_exact_public_contracts() {
        let cancellation = cancelled_error().context("processing failed");
        assert!(is_cancelled_error(&cancellation));
        assert_eq!(
            cancellation.root_cause().to_string(),
            "Transcription cancelled"
        );

        for message in [
            "FFmpeg not found on PATH",
            "Please install ffmpeg",
            "FFMPEG IS REQUIRED for video",
        ] {
            assert!(is_ffmpeg_error_message(message));
        }
        assert!(!is_ffmpeg_error_message("Audio file is unreadable"));

        assert_eq!(
            SUPPORTED_AUDIO_FORMATS,
            ["wav", "mp3", "m4a", "aac", "ogg", "flac"]
        );
        assert_eq!(SUPPORTED_VIDEO_FORMATS, ["mp4", "mov", "webm", "mkv"]);
        assert_eq!(CHUNK_OVERLAP_SECONDS, 5);
        assert_eq!(DIRECT_TRANSCRIBE_MINUTES, MAX_CHUNK_MINUTES);
        assert_eq!(TARGET_SAMPLE_RATE, 16_000);
        assert_eq!(EVENT_LIBRARY_PROGRESS, "library:transcription_progress");
        assert_eq!(EVENT_LIBRARY_COMPLETE, "library:transcription_complete");
        assert_eq!(EVENT_LIBRARY_ERROR, "library:transcription_error");
        assert_eq!(EVENT_LIBRARY_IMPORT_PROGRESS, "library:import_progress");
        assert_eq!(EVENT_MEETING_CAPTURE_STATE, "meeting:capture_state");
        assert_eq!(EVENT_MEETING_DETAILS_CHANGED, "meeting:details_changed");
        assert_eq!(EVENT_MEETING_TRANSCRIPT_UPDATE, "meeting:transcript_update");
        #[cfg(target_os = "macos")]
        {
            assert_eq!(EVENT_LIBRARY_OPEN_IMPORT, "library:open_import");
            assert_eq!(EVENT_LIBRARY_RENDERER_READY, "library:renderer_ready");
        }
    }
}
