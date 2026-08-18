#[path = "settings_model.rs"]
mod settings_model;
#[path = "settings_policy.rs"]
mod settings_policy;
#[path = "settings_store.rs"]
mod settings_store;

pub use settings_model::{
    AppBinding, AutoDeleteTarget, MediaAction, ModeRule, ModeRuleTrigger, Personality,
    RecordingPrunePolicy, Replacement, ShortcutBinding, ShortcutBindings, ThemeMode,
    TranscriptionMode, UserSettings, UserSnippet, WorkflowEngine, WorkflowField, WorkflowInput,
    WorkflowOutput,
};
pub use settings_policy::{
    auto_delete_recording_policy, auto_delete_transcription_policy, canonicalize_app_locale,
    canonicalize_app_locale_or_default, canonicalize_recording_prune_policy,
    default_local_llm_model, default_local_model, default_meeting_ai_provider,
    default_remote_speech_endpoint, default_remote_speech_model, default_remote_speech_provider,
    sync_legacy_shortcuts_from_bindings,
};
pub(crate) use settings_policy::{default_true, recording_prune_cutoff};
pub(crate) use settings_store::cli_data_dir;

pub fn shortcut_bindings_from_legacy(settings: &UserSettings) -> ShortcutBindings {
    settings_policy::shortcut_bindings_from_legacy(settings)
}

pub fn default_shortcut_bindings() -> ShortcutBindings {
    settings_policy::default_shortcut_bindings()
}
pub use settings_store::SettingsStore;
