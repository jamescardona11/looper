macro_rules! crate_modules {
    ($($module:ident),+ $(,)?) => { $(mod $module;)+ };
}

crate_modules!(
    accessibility_context,
    analytics,
    assistive,
    audio,
    auto_dictionary,
    awareness_notification,
    capture_pill,
    cli_install,
    cloud_speech,
    cloud_streaming,
    core,
    corrections,
    crypto,
    data_export,
    desktop_runtime,
    dictionary,
    field_format,
    import,
    integrations,
    library,
    license,
    llm_cleanup,
    local_llm,
    markdown_mirror,
    meeting_awareness,
    memory,
    mode_context,
    mode_rules,
    model_language_table,
    music,
    permissions,
    personalization,
    personalization_snippets,
    pill,
    platform,
    recent_transcriptions,
    recorder,
    remote_api,
    screen_vocabulary,
    selection_actions,
    settings,
    speech,
    spoken_formatting,
    storage,
    streaming_transcription,
    toast,
    transcribe,
    transcription_api,
    tray,
    update_checker,
    user_snippets,
);

#[cfg(debug_assertions)]
mod qa_lab;
#[cfg(target_os = "macos")]
mod screen_ocr;

pub(crate) use speech::remote as remote_speech;
pub(crate) use speech::{engine as local_transcription, install as model_manager};

#[cfg(target_os = "macos")]
pub(crate) use desktop_runtime::set_app_menu;
#[allow(unused_imports)]
pub(crate) use desktop_runtime::{
    emit_error, emit_event, persist_recording_async, recordings_root, refresh_native_menus,
    restore_recording_shortcuts, schedule_recording_prune, schedule_transcription_prune,
    stop_active_recording, sync_launch_at_login, AppRuntime, AudioSpectrumPayload,
    RecordingStartPayload, TranscriptionCompletePayload, TranscriptionErrorPayload,
    EVENT_AUDIO_SPECTRUM, EVENT_LICENSE_CHECKOUT_RETURNED, EVENT_RECORDING_START,
    EVENT_SETTINGS_CHANGED, EVENT_TRANSCRIPTION_COMPLETE, EVENT_TRANSCRIPTION_ERROR,
    MAIN_WINDOW_LABEL, SETTINGS_WINDOW_LABEL,
};
pub use desktop_runtime::{
    run, run_cli, run_local_llm_sidecar, AppState, LibraryJob, LibraryJobKind,
};
