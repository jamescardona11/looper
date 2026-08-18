mod bootstrap;
mod cli;
mod commands;
mod contracts;
mod recordings;
mod state;

pub use bootstrap::{run, run_local_llm_sidecar};
pub use cli::run_cli;
pub use contracts::{LibraryJob, LibraryJobKind};
pub use state::AppState;

#[cfg(target_os = "macos")]
pub(crate) use bootstrap::set_app_menu;
pub(crate) use bootstrap::sync_launch_at_login;
pub(crate) use commands::interaction::stop_active_recording;
pub(crate) use commands::preferences::{refresh_native_menus, restore_recording_shortcuts};
pub(crate) use contracts::{
    AppRuntime, AudioSpectrumPayload, RecordingStartPayload, TranscriptionCompletePayload,
    TranscriptionErrorPayload, EVENT_AUDIO_SPECTRUM, EVENT_LICENSE_CHECKOUT_RETURNED,
    EVENT_RECORDING_START, EVENT_SETTINGS_CHANGED, EVENT_TRANSCRIPTION_COMPLETE,
    EVENT_TRANSCRIPTION_ERROR, MAIN_WINDOW_LABEL, SETTINGS_WINDOW_LABEL,
};
pub(crate) use recordings::{
    emit_error, emit_event, persist_recording_async, recordings_root, schedule_recording_prune,
    schedule_transcription_prune,
};
