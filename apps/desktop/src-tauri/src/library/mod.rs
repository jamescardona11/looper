pub(crate) mod commands;
mod meeting_capture;
pub(crate) mod meeting_commands;
#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
mod meeting_live_transcription;
mod meeting_silence;
mod meeting_summary;
mod processing;
mod queue;
pub(crate) mod repo;
mod types;
pub(crate) mod watch;
pub(crate) mod youtube;

#[cfg(target_os = "macos")]
pub(crate) use commands::handle_opened_paths;
pub(crate) use meeting_capture::MeetingCaptureManager;
pub(crate) use meeting_silence::CONTINUE_MEETING_ACTION;
pub(crate) use processing::{build_export_content, build_meeting_export_content, convert_to_wav};
pub(crate) use types::default_item_kind;
#[cfg(target_os = "macos")]
pub use types::EVENT_LIBRARY_RENDERER_READY;
pub use types::{
    ExportFormat, LibraryFilter, LibraryImportOptions, LibraryItem, LibraryItemPatch,
    LibraryItemStatus, LibraryTranslation, MeetingDetails, MeetingNoteMarker, MeetingNotesUpdate,
    MeetingStartOptions, MeetingSummaryStatus, MeetingTranscriptSegment, Speaker,
    TranscriptSegment,
};
#[cfg(test)]
pub(crate) use types::{MeetingCalendarContext, MeetingTranscriptSource};
pub(crate) use types::{MeetingCapturePhase, MeetingCaptureState};
pub use watch::LibraryWatchFolder;
