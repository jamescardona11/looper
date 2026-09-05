use serde::Deserialize;

use crate::{
    core::hotkeys,
    model_manager,
    settings::{
        canonicalize_app_locale, AutoDeleteTarget, MediaAction, RecordingPrunePolicy,
        ShortcutBinding, ShortcutBindings, ThemeMode, TranscriptionMode,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateSettingsArgs {
    #[serde(flatten)]
    pub recording: RecordingInput,
    #[serde(flatten)]
    pub speech: SpeechInput,
    #[serde(flatten)]
    pub intelligence: IntelligenceInput,
    #[serde(flatten)]
    pub product: ProductInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecordingInput {
    pub smart_shortcut: String,
    pub smart_enabled: bool,
    pub hold_shortcut: String,
    pub hold_enabled: bool,
    pub toggle_shortcut: String,
    pub toggle_enabled: bool,
    pub shortcut_bindings: ShortcutBindings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpeechInput {
    pub transcription_mode: TranscriptionMode,
    pub local_model: String,
    #[serde(default)]
    pub remote_speech_enabled: bool,
    #[serde(default = "crate::settings::default_remote_speech_provider")]
    pub remote_speech_provider: String,
    #[serde(default = "crate::settings::default_remote_speech_endpoint")]
    pub remote_speech_endpoint: String,
    #[serde(default)]
    pub remote_speech_api_key: String,
    #[serde(default = "crate::settings::default_remote_speech_model")]
    pub remote_speech_model: String,
    pub microphone_device: Option<String>,
    pub language: String,
    pub app_locale: String,
    pub theme_mode: ThemeMode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntelligenceInput {
    pub llm_enabled: bool,
    pub cleanup_enabled: bool,
    pub llm_provider: String,
    pub llm_endpoint: String,
    pub llm_api_key: String,
    pub llm_model: String,
    #[serde(default = "crate::settings::default_meeting_ai_provider")]
    pub meeting_ai_provider: String,
    #[serde(default = "crate::settings::default_local_llm_model")]
    pub local_llm_model: String,
    pub edit_mode_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProductInput {
    pub auto_dictionary_enabled: bool,
    #[serde(default)]
    pub preview_before_insert_enabled: bool,
    #[serde(default = "crate::settings::default_true")]
    pub preview_before_insert_selection_enabled: bool,
    #[serde(default)]
    pub use_screen_context: bool,
    #[serde(default)]
    pub media_action: MediaAction,
    pub auto_update_enabled: bool,
    pub auto_launch_enabled: bool,
    pub start_in_background: bool,
    #[serde(default)]
    pub calendar_meeting_awareness_enabled: bool,
    #[serde(default = "crate::settings::default_true")]
    pub microphone_meeting_awareness_enabled: bool,
    #[serde(default = "crate::settings::default_true")]
    pub meeting_system_audio_enabled: bool,
    #[serde(default = "crate::settings::default_true")]
    pub meeting_live_transcript_enabled: bool,
    pub auto_delete_target: AutoDeleteTarget,
    pub auto_delete_duration: RecordingPrunePolicy,
    #[serde(default)]
    pub audio_storage_budget_mb: u32,
    #[serde(default)]
    pub hide_overlays_from_capture: bool,
    #[serde(default)]
    pub markdown_mirror_enabled: bool,
    #[serde(default)]
    pub markdown_mirror_path: String,
    pub analytics_enabled: bool,
}

#[derive(Debug)]
pub(crate) struct ValidatedSettingsUpdate {
    pub args: UpdateSettingsArgs,
    pub shortcut_bindings: ShortcutBindings,
    pub cleanup_requested: bool,
}

impl ValidatedSettingsUpdate {
    pub(crate) fn requires_license(&self) -> bool {
        self.args.intelligence.llm_enabled
            || self.cleanup_requested
            || self.args.intelligence.edit_mode_enabled
    }

    pub(crate) fn requested_auto_launch(&self) -> bool {
        self.args.product.auto_launch_enabled
    }
}

struct RecordingMode<'a> {
    name: &'static str,
    enabled: bool,
    bindings: &'a [ShortcutBinding],
}

impl RecordingInput {
    fn modes(&self) -> [RecordingMode<'_>; 3] {
        [
            RecordingMode {
                name: "Smart",
                enabled: self.smart_enabled,
                bindings: &self.shortcut_bindings.smart,
            },
            RecordingMode {
                name: "Hold",
                enabled: self.hold_enabled,
                bindings: &self.shortcut_bindings.hold,
            },
            RecordingMode {
                name: "Toggle",
                enabled: self.toggle_enabled,
                bindings: &self.shortcut_bindings.toggle,
            },
        ]
    }
}

pub(crate) fn validate(args: UpdateSettingsArgs) -> Result<ValidatedSettingsUpdate, String> {
    validate_modes(&args)?;
    validate_models(&args)?;
    validate_language_and_intelligence(&args)?;

    let shortcut_bindings = canonicalize_bindings(&args.recording.shortcut_bindings)?;
    let cleanup_requested = args.intelligence.cleanup_enabled
        || bindings_request_cleanup(&args.recording.shortcut_bindings);

    Ok(ValidatedSettingsUpdate {
        args,
        shortcut_bindings,
        cleanup_requested,
    })
}

fn validate_modes(args: &UpdateSettingsArgs) -> Result<(), String> {
    let modes = args.recording.modes();
    if !modes.iter().any(|mode| mode.enabled) {
        return Err("At least one recording mode must be enabled".into());
    }

    let mut shortcuts = Vec::new();
    for mode in modes {
        collect_mode_shortcuts(&mut shortcuts, mode.name, mode.enabled, mode.bindings)?;
        if mode.enabled
            && !shortcuts
                .iter()
                .any(|(entry_name, _)| *entry_name == mode.name)
        {
            return Err(format!(
                "{} shortcut cannot be empty when enabled",
                mode.name
            ));
        }
    }
    ensure_shortcuts_do_not_conflict(&shortcuts)
}

fn collect_mode_shortcuts(
    destination: &mut Vec<(&'static str, hotkeys::Hotkey)>,
    mode: &'static str,
    enabled: bool,
    bindings: &[ShortcutBinding],
) -> Result<(), String> {
    if !enabled {
        return Ok(());
    }
    for binding in bindings
        .iter()
        .take(3)
        .filter(|binding| !binding.shortcut.trim().is_empty())
    {
        let shortcut = hotkeys::parse_shortcut(binding.shortcut.trim())
            .map_err(|error| format!("{mode} shortcut is invalid: {error}"))?;
        hotkeys::validate_recording_shortcut(&shortcut)
            .map_err(|error| format!("{mode} shortcut is invalid: {error}"))?;
        destination.push((mode, shortcut));
    }
    Ok(())
}

fn ensure_shortcuts_do_not_conflict(shortcuts: &[(&str, hotkeys::Hotkey)]) -> Result<(), String> {
    for (index, (first_name, first)) in shortcuts.iter().enumerate() {
        for (second_name, second) in shortcuts.iter().skip(index + 1) {
            if first == second {
                return Err(format!(
                    "{first_name} and {second_name} shortcuts cannot be the same"
                ));
            }
            if hotkeys::shortcuts_conflict(first, second) {
                return Err(format!(
                    "{first_name} shortcut overlaps {second_name} shortcut. Choose a more specific combination."
                ));
            }
        }
    }
    Ok(())
}

fn validate_models(args: &UpdateSettingsArgs) -> Result<(), String> {
    if model_manager::definition(&args.speech.local_model).is_none() {
        return Err("Unknown model selection".into());
    }
    if !args.speech.remote_speech_enabled {
        return Ok(());
    }
    if args.speech.remote_speech_endpoint.trim().is_empty() {
        return Err("Remote speech endpoint cannot be empty".into());
    }
    if crate::remote_speech::provider_requires_api_key(&args.speech.remote_speech_provider)
        && args.speech.remote_speech_api_key.trim().is_empty()
    {
        return Err("Remote speech API key cannot be empty".into());
    }
    if crate::remote_speech::resolve_model(
        &args.speech.remote_speech_provider,
        &args.speech.remote_speech_model,
    )
    .is_none()
    {
        return Err("Choose a remote speech model before enabling remote transcription".into());
    }
    Ok(())
}

fn validate_language_and_intelligence(args: &UpdateSettingsArgs) -> Result<(), String> {
    if canonicalize_app_locale(&args.speech.app_locale).is_none() {
        return Err("Unknown app language selection".into());
    }
    if args.intelligence.llm_enabled && args.intelligence.llm_provider == "none" {
        return Err("LLM cannot be enabled when provider is None".into());
    }
    if !matches!(
        args.intelligence.meeting_ai_provider.as_str(),
        "local" | "writing" | "none"
    ) {
        return Err("Unknown meeting intelligence provider".into());
    }
    if args.intelligence.meeting_ai_provider == "local"
        && !crate::local_llm::is_known_model(&args.intelligence.local_llm_model)
    {
        return Err("Unknown local meeting intelligence model".into());
    }
    if (args.intelligence.cleanup_enabled
        || bindings_request_cleanup(&args.recording.shortcut_bindings))
        && !args.intelligence.llm_enabled
    {
        return Err("AI Cleanup cannot be enabled without an active language model".into());
    }
    if args.intelligence.llm_enabled && args.intelligence.llm_endpoint.trim().is_empty() {
        return Err("Language model endpoint cannot be empty".into());
    }
    if args.intelligence.llm_enabled && args.intelligence.llm_model.trim().is_empty() {
        return Err("Choose a language model before enabling AI features".into());
    }
    Ok(())
}

fn canonicalize_bindings(bindings: &ShortcutBindings) -> Result<ShortcutBindings, String> {
    let normalize = |entries: &[ShortcutBinding]| {
        entries
            .iter()
            .take(3)
            .filter(|entry| !entry.shortcut.trim().is_empty())
            .map(|entry| {
                let shortcut =
                    hotkeys::parse_shortcut(&entry.shortcut).map_err(|error| error.to_string())?;
                hotkeys::validate_recording_shortcut(&shortcut)
                    .map_err(|error| error.to_string())?;
                Ok(ShortcutBinding {
                    shortcut: shortcut.to_string(),
                    temporary: entry.temporary,
                    cleanup_enabled: entry.cleanup_enabled,
                })
            })
            .collect::<Result<Vec<_>, String>>()
    };
    Ok(ShortcutBindings {
        smart: normalize(&bindings.smart)?,
        hold: normalize(&bindings.hold)?,
        toggle: normalize(&bindings.toggle)?,
    })
}

pub(crate) fn bindings_request_cleanup(bindings: &ShortcutBindings) -> bool {
    [&bindings.smart, &bindings.hold, &bindings.toggle]
        .into_iter()
        .flatten()
        .any(|binding| binding.cleanup_enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{default_local_model, default_shortcut_bindings};

    fn base_args() -> UpdateSettingsArgs {
        UpdateSettingsArgs {
            recording: RecordingInput {
                smart_shortcut: "Control+Space".into(),
                smart_enabled: true,
                hold_shortcut: "Control+Shift+Space".into(),
                hold_enabled: false,
                toggle_shortcut: "Control+Alt+Space".into(),
                toggle_enabled: false,
                shortcut_bindings: default_shortcut_bindings(),
            },
            speech: SpeechInput {
                transcription_mode: TranscriptionMode::Local,
                local_model: default_local_model(),
                remote_speech_enabled: false,
                remote_speech_provider: "openai".into(),
                remote_speech_endpoint: crate::settings::default_remote_speech_endpoint(),
                remote_speech_api_key: String::new(),
                remote_speech_model: crate::settings::default_remote_speech_model(),
                microphone_device: None,
                language: "en".into(),
                app_locale: "system".into(),
                theme_mode: ThemeMode::default(),
            },
            intelligence: IntelligenceInput {
                llm_enabled: false,
                cleanup_enabled: false,
                llm_provider: "none".into(),
                llm_endpoint: String::new(),
                llm_api_key: String::new(),
                llm_model: String::new(),
                meeting_ai_provider: "writing".into(),
                local_llm_model: crate::local_llm::DEFAULT_MODEL_ID.into(),
                edit_mode_enabled: false,
            },
            product: ProductInput {
                auto_dictionary_enabled: false,
                preview_before_insert_enabled: false,
                preview_before_insert_selection_enabled: true,
                use_screen_context: false,
                media_action: MediaAction::Pause,
                auto_update_enabled: true,
                auto_launch_enabled: false,
                start_in_background: true,
                calendar_meeting_awareness_enabled: false,
                microphone_meeting_awareness_enabled: true,
                meeting_system_audio_enabled: true,
                meeting_live_transcript_enabled: true,
                auto_delete_target: AutoDeleteTarget::Transcripts,
                auto_delete_duration: RecordingPrunePolicy::Never,
                audio_storage_budget_mb: 0,
                hide_overlays_from_capture: false,
                markdown_mirror_enabled: false,
                markdown_mirror_path: String::new(),
                analytics_enabled: true,
            },
        }
    }

    fn set_primary(args: &mut UpdateSettingsArgs, mode: &str, shortcut: &str) {
        let binding = ShortcutBinding {
            shortcut: shortcut.into(),
            temporary: false,
            cleanup_enabled: false,
        };
        match mode {
            "Smart" => {
                args.recording.smart_shortcut = shortcut.into();
                args.recording.shortcut_bindings.smart = vec![binding];
            }
            "Hold" => {
                args.recording.hold_shortcut = shortcut.into();
                args.recording.shortcut_bindings.hold = vec![binding];
            }
            "Toggle" => {
                args.recording.toggle_shortcut = shortcut.into();
                args.recording.shortcut_bindings.toggle = vec![binding];
            }
            _ => unreachable!("unknown recording mode"),
        }
    }

    #[test]
    fn rejects_invalid_intelligence_and_cleanup_requests() {
        let mut no_provider = base_args();
        no_provider.intelligence.llm_enabled = true;
        assert_eq!(
            validate(no_provider).unwrap_err(),
            "LLM cannot be enabled when provider is None"
        );

        let mut cleanup_without_model = base_args();
        cleanup_without_model.intelligence.cleanup_enabled = true;
        assert_eq!(
            validate(cleanup_without_model).unwrap_err(),
            "AI Cleanup cannot be enabled without an active language model"
        );
    }

    #[test]
    fn validates_remote_speech_requirements() {
        let mut missing_key = base_args();
        missing_key.speech.remote_speech_enabled = true;
        missing_key.speech.remote_speech_api_key = "  ".into();
        assert_eq!(
            validate(missing_key).unwrap_err(),
            "Remote speech API key cannot be empty"
        );

        let mut automatic = base_args();
        automatic.speech.remote_speech_enabled = true;
        automatic.speech.remote_speech_api_key = "test".into();
        automatic.speech.remote_speech_model = "auto".into();
        assert!(validate(automatic).is_ok());
    }

    #[test]
    fn rejects_colliding_or_invalid_shortcuts() {
        let mut collision = base_args();
        collision.recording.hold_enabled = true;
        set_primary(&mut collision, "Smart", "Control+Space");
        set_primary(&mut collision, "Hold", "Ctrl+Space");
        assert_eq!(
            validate(collision).unwrap_err(),
            "Smart and Hold shortcuts cannot be the same"
        );

        let mut caps_lock = base_args();
        set_primary(&mut caps_lock, "Smart", "CapsLock");
        assert_eq!(
            validate(caps_lock).unwrap_err(),
            "Smart shortcut is invalid: CapsLock cannot be used as a recording shortcut"
        );
    }

    #[test]
    fn accepts_modifier_only_shortcuts_and_normalizes_bindings() {
        let mut args = base_args();
        set_primary(&mut args, "Smart", "Ctrl");

        let validated = validate(args).unwrap();

        assert_eq!(validated.shortcut_bindings.smart[0].shortcut, "Ctrl");
    }

    #[test]
    fn rejects_settings_without_an_enabled_recording_mode() {
        let mut args = base_args();
        args.recording.smart_enabled = false;

        let error = validate(args).unwrap_err();

        assert_eq!(error, "At least one recording mode must be enabled");
    }

    #[test]
    fn rejects_unavailable_models_and_invalid_locale() {
        let mut unavailable_local_model = base_args();
        unavailable_local_model.speech.local_model = "not-installed".into();
        assert_eq!(
            validate(unavailable_local_model).unwrap_err(),
            "Unknown model selection"
        );

        let mut unavailable_remote_model = base_args();
        unavailable_remote_model.speech.remote_speech_enabled = true;
        unavailable_remote_model.speech.remote_speech_provider = "not-a-provider".into();
        unavailable_remote_model.speech.remote_speech_model = "auto".into();
        assert_eq!(
            validate(unavailable_remote_model).unwrap_err(),
            "Choose a remote speech model before enabling remote transcription"
        );

        let mut unsupported_locale = base_args();
        unsupported_locale.speech.app_locale = "not-a-locale".into();
        assert_eq!(
            validate(unsupported_locale).unwrap_err(),
            "Unknown app language selection"
        );
    }
}
