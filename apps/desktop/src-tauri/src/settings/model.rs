use serde::{de::Deserializer, Deserialize, Serialize};

use crate::selection_actions::TransformPreset;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Replacement {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserSnippet {
    pub trigger: String,
    pub expansion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppBinding {
    pub name: String,
    #[serde(default)]
    pub identifier: Option<String>,
}

impl AppBinding {
    pub fn legacy(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            identifier: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PersistedAppBinding {
    Name(String),
    Object(AppBinding),
}

fn app_bindings_from_wire<'de, D>(deserializer: D) -> Result<Vec<AppBinding>, D::Error>
where
    D: Deserializer<'de>,
{
    Vec::<PersistedAppBinding>::deserialize(deserializer).map(|entries| {
        entries
            .into_iter()
            .map(|entry| match entry {
                PersistedAppBinding::Name(name) => AppBinding::legacy(name),
                PersistedAppBinding::Object(binding) => binding,
            })
            .collect()
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Personality {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    #[serde(default, deserialize_with = "app_bindings_from_wire")]
    pub apps: Vec<AppBinding>,
    #[serde(default)]
    pub websites: Vec<String>,
    #[serde(default)]
    pub instructions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ModeRuleTrigger {
    BundleId { bundle_id: String },
    UrlPattern { url_pattern: String },
    Field { field: WorkflowField },
    Hotkey { shortcut: String },
    Manual,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowField {
    Email,
    Chat,
    Document,
    Prompt,
    Code,
    Form,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowInput {
    #[default]
    Dictation,
    Selection,
    Clipboard,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowEngine {
    #[default]
    Auto,
    Local,
    Cloud,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowOutput {
    Insert,
    Replace,
    Copy,
}

impl<'de> Deserialize<'de> for WorkflowOutput {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(tag = "type", rename_all = "snake_case")]
        enum WireOutput {
            Insert,
            Replace,
            Copy,
            #[serde(other)]
            Unknown,
        }

        WireOutput::deserialize(deserializer).map(|stored| match stored {
            WireOutput::Insert => Self::Insert,
            WireOutput::Replace => Self::Replace,
            WireOutput::Copy | WireOutput::Unknown => Self::Copy,
        })
    }
}

impl Default for WorkflowOutput {
    fn default() -> Self {
        Self::Insert
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModeRule {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub enabled: bool,
    pub trigger: ModeRuleTrigger,
    #[serde(default)]
    pub input: WorkflowInput,
    #[serde(default)]
    pub engine: WorkflowEngine,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub transform_preset: Option<TransformPreset>,
    #[serde(default)]
    pub custom_prompt: Option<String>,
    #[serde(default)]
    pub deterministic_only: bool,
    #[serde(default)]
    pub output: WorkflowOutput,
    #[serde(default)]
    pub auto_send_on_insert: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShortcutBinding {
    pub shortcut: String,
    #[serde(default)]
    pub temporary: bool,
    #[serde(default)]
    pub cleanup_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShortcutBindings {
    #[serde(default)]
    pub smart: Vec<ShortcutBinding>,
    #[serde(default)]
    pub hold: Vec<ShortcutBinding>,
    #[serde(default)]
    pub toggle: Vec<ShortcutBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default = "super::policy::default_smart_shortcut")]
    pub smart_shortcut: String,
    #[serde(default = "super::policy::default_true")]
    pub smart_enabled: bool,
    #[serde(default = "super::policy::default_hold_shortcut")]
    pub hold_shortcut: String,
    #[serde(default)]
    pub hold_enabled: bool,
    #[serde(default = "super::policy::default_toggle_shortcut")]
    pub toggle_shortcut: String,
    #[serde(default)]
    pub toggle_enabled: bool,
    #[serde(default = "super::policy::default_shortcut_bindings")]
    pub shortcut_bindings: ShortcutBindings,
    #[serde(default = "super::policy::default_transcription_mode")]
    pub transcription_mode: TranscriptionMode,
    #[serde(default = "super::policy::default_local_model")]
    pub local_model: String,
    #[serde(default)]
    pub remote_speech_enabled: bool,
    #[serde(default = "super::policy::default_remote_speech_provider")]
    pub remote_speech_provider: String,
    #[serde(default = "super::policy::default_remote_speech_endpoint")]
    pub remote_speech_endpoint: String,
    #[serde(default)]
    pub remote_speech_api_key: String,
    #[serde(default = "super::policy::default_remote_speech_model")]
    pub remote_speech_model: String,
    pub microphone_device: Option<String>,
    #[serde(default = "super::policy::default_language")]
    pub language: String,
    #[serde(default)]
    pub capture_pill_presentation: crate::pill::capture::CapturePillPresentation,
    #[serde(default)]
    pub capture_pill_dock_position: crate::pill::capture::CapturePillDockPosition,
    #[serde(default = "super::policy::default_app_locale")]
    pub app_locale: String,
    #[serde(default)]
    pub theme_mode: ThemeMode,
    #[serde(default)]
    pub llm_enabled: bool,
    #[serde(default)]
    pub cleanup_enabled: bool,
    #[serde(default = "super::policy::default_llm_provider")]
    pub llm_provider: String,
    #[serde(default)]
    pub llm_endpoint: String,
    #[serde(default)]
    pub llm_api_key: String,
    #[serde(default)]
    pub llm_model: String,
    #[serde(default = "super::policy::default_meeting_ai_provider")]
    pub meeting_ai_provider: String,
    #[serde(default = "super::policy::default_local_llm_model")]
    pub local_llm_model: String,
    #[serde(default)]
    pub personalities_notes_seeded: bool,
    #[serde(default)]
    pub dictionary: Vec<String>,
    #[serde(default)]
    pub auto_dictionary_enabled: bool,
    #[serde(default)]
    pub auto_dictionary_ignored: Vec<String>,
    #[serde(default)]
    pub replacements: Vec<Replacement>,
    #[serde(default)]
    pub user_snippets: Vec<UserSnippet>,
    #[serde(default = "super::policy::default_personalities")]
    pub personalities: Vec<Personality>,
    #[serde(default)]
    pub mode_rules: Vec<ModeRule>,
    #[serde(skip)]
    pub active_workflow_id: Option<String>,
    #[serde(default)]
    pub edit_mode_enabled: bool,
    #[serde(default)]
    pub preview_before_insert_enabled: bool,
    #[serde(default = "super::policy::default_true")]
    pub preview_before_insert_selection_enabled: bool,
    #[serde(default)]
    pub use_screen_context: bool,
    #[serde(default)]
    pub media_action: MediaAction,
    #[serde(default)]
    pub auto_update_enabled: bool,
    #[serde(default)]
    pub auto_launch_enabled: bool,
    #[serde(default)]
    pub start_in_background: bool,
    #[serde(default)]
    pub calendar_meeting_awareness_enabled: bool,
    #[serde(default = "super::policy::default_true")]
    pub microphone_meeting_awareness_enabled: bool,
    #[serde(default = "super::policy::default_auto_delete_target")]
    pub auto_delete_target: AutoDeleteTarget,
    #[serde(default = "super::policy::default_auto_delete_duration")]
    pub auto_delete_duration: RecordingPrunePolicy,
    #[serde(default)]
    pub audio_storage_budget_mb: u32,
    #[serde(default)]
    pub hide_overlays_from_capture: bool,
    #[serde(default)]
    pub markdown_mirror_enabled: bool,
    #[serde(default)]
    pub markdown_mirror_path: String,
    #[serde(default = "super::policy::default_true")]
    pub analytics_enabled: bool,
    #[serde(default)]
    pub analytics_install_id: String,
    #[serde(skip)]
    pub analytics_first_run: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionMode {
    #[default]
    Local,
    Cloud,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RecordingPrunePolicy {
    #[default]
    Never,
    Immediately,
    Day,
    Week,
    Month,
    ThreeMonths,
    Year,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AutoDeleteTarget {
    #[default]
    Transcripts,
    Audio,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum MediaAction {
    #[default]
    Off,
    Pause,
    Duck10,
    Duck25,
    Duck50,
    Duck75,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    #[default]
    System,
    Light,
    Dark,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_bindings_accept_legacy_names_and_current_objects_together() {
        let personality: Personality = serde_json::from_value(serde_json::json!({
            "id": "mixed", "name": "Mixed", "enabled": true,
            "apps": ["Mail", {"name": "Slack", "identifier": "com.slack"}]
        }))
        .unwrap();
        assert_eq!(personality.apps[0], AppBinding::legacy("Mail"));
        assert_eq!(personality.apps[1].identifier.as_deref(), Some("com.slack"));
    }

    #[test]
    fn workflow_output_normalizes_unknown_wire_variants_to_copy() {
        let output: WorkflowOutput =
            serde_json::from_value(serde_json::json!({"type": "retired", "extra": 1})).unwrap();
        assert_eq!(output, WorkflowOutput::Copy);
        assert_eq!(
            serde_json::to_value(output).unwrap(),
            serde_json::json!({"type": "copy"})
        );
    }

    #[test]
    fn transient_runtime_fields_are_not_part_of_the_settings_wire_format() {
        let mut settings = UserSettings::default();
        settings.active_workflow_id = Some("active".to_owned());
        settings.analytics_first_run = true;
        let wire = serde_json::to_value(settings).unwrap();
        assert!(wire.get("active_workflow_id").is_none());
        assert!(wire.get("analytics_first_run").is_none());
    }

    #[test]
    fn user_settings_wire_keys_remain_complete_and_stable() {
        let wire = serde_json::to_value(UserSettings::default()).unwrap();
        let mut actual = wire
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        actual.sort();
        let mut expected = vec![
            "analytics_enabled",
            "analytics_install_id",
            "app_locale",
            "audio_storage_budget_mb",
            "auto_delete_duration",
            "auto_delete_target",
            "auto_dictionary_enabled",
            "auto_dictionary_ignored",
            "auto_launch_enabled",
            "auto_update_enabled",
            "calendar_meeting_awareness_enabled",
            "capture_pill_dock_position",
            "capture_pill_presentation",
            "cleanup_enabled",
            "dictionary",
            "edit_mode_enabled",
            "hide_overlays_from_capture",
            "hold_enabled",
            "hold_shortcut",
            "language",
            "llm_api_key",
            "llm_enabled",
            "llm_endpoint",
            "llm_model",
            "llm_provider",
            "local_llm_model",
            "local_model",
            "markdown_mirror_enabled",
            "markdown_mirror_path",
            "media_action",
            "meeting_ai_provider",
            "microphone_meeting_awareness_enabled",
            "microphone_device",
            "mode_rules",
            "onboarding_completed",
            "personalities",
            "personalities_notes_seeded",
            "preview_before_insert_enabled",
            "preview_before_insert_selection_enabled",
            "remote_speech_api_key",
            "remote_speech_enabled",
            "remote_speech_endpoint",
            "remote_speech_model",
            "remote_speech_provider",
            "replacements",
            "shortcut_bindings",
            "smart_enabled",
            "smart_shortcut",
            "start_in_background",
            "theme_mode",
            "toggle_enabled",
            "toggle_shortcut",
            "transcription_mode",
            "use_screen_context",
            "user_snippets",
        ];
        expected.sort();
        assert_eq!(actual, expected);
    }

    #[test]
    fn workflow_rule_missing_optional_fields_uses_the_persisted_defaults() {
        let rule: ModeRule = serde_json::from_value(serde_json::json!({
            "id": "manual-rule",
            "enabled": true,
            "trigger": {"type": "manual"}
        }))
        .unwrap();
        assert_eq!(rule.name, "");
        assert_eq!(rule.input, WorkflowInput::Dictation);
        assert_eq!(rule.engine, WorkflowEngine::Auto);
        assert_eq!(rule.language, None);
        assert_eq!(rule.transform_preset, None);
        assert_eq!(rule.custom_prompt, None);
        assert!(!rule.deterministic_only);
        assert_eq!(rule.output, WorkflowOutput::Insert);
        assert!(!rule.auto_send_on_insert);
    }

    #[test]
    fn enum_wire_names_match_existing_frontend_payloads() {
        let cases = [
            (
                serde_json::to_value(TranscriptionMode::Cloud).unwrap(),
                serde_json::json!("cloud"),
            ),
            (
                serde_json::to_value(RecordingPrunePolicy::ThreeMonths).unwrap(),
                serde_json::json!("three_months"),
            ),
            (
                serde_json::to_value(AutoDeleteTarget::Audio).unwrap(),
                serde_json::json!("audio"),
            ),
            (
                serde_json::to_value(MediaAction::Duck25).unwrap(),
                serde_json::json!("duck25"),
            ),
            (
                serde_json::to_value(ThemeMode::System).unwrap(),
                serde_json::json!("system"),
            ),
            (
                serde_json::to_value(WorkflowInput::Clipboard).unwrap(),
                serde_json::json!("clipboard"),
            ),
            (
                serde_json::to_value(WorkflowEngine::Cloud).unwrap(),
                serde_json::json!("cloud"),
            ),
            (
                serde_json::to_value(WorkflowField::Prompt).unwrap(),
                serde_json::json!("prompt"),
            ),
        ];
        for (actual, expected) in cases {
            assert_eq!(actual, expected);
        }
    }

    #[test]
    fn personalization_value_objects_keep_their_exact_json_shape() {
        let replacement = Replacement {
            from: "teh".to_owned(),
            to: "the".to_owned(),
        };
        let snippet = UserSnippet {
            trigger: "sig".to_owned(),
            expansion: "Regards".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(replacement).unwrap(),
            serde_json::json!({"from": "teh", "to": "the"})
        );
        assert_eq!(
            serde_json::to_value(snippet).unwrap(),
            serde_json::json!({"trigger": "sig", "expansion": "Regards"})
        );
    }

    #[test]
    fn mode_triggers_keep_their_tagged_wire_contract() {
        let triggers = [
            (
                ModeRuleTrigger::BundleId {
                    bundle_id: "com.example.app".to_owned(),
                },
                serde_json::json!({"type": "bundle_id", "bundle_id": "com.example.app"}),
            ),
            (
                ModeRuleTrigger::UrlPattern {
                    url_pattern: "*.example.com".to_owned(),
                },
                serde_json::json!({"type": "url_pattern", "url_pattern": "*.example.com"}),
            ),
            (
                ModeRuleTrigger::Field {
                    field: WorkflowField::Email,
                },
                serde_json::json!({"type": "field", "field": "email"}),
            ),
            (
                ModeRuleTrigger::Hotkey {
                    shortcut: "Control+1".to_owned(),
                },
                serde_json::json!({"type": "hotkey", "shortcut": "Control+1"}),
            ),
            (
                ModeRuleTrigger::Manual,
                serde_json::json!({"type": "manual"}),
            ),
        ];
        for (trigger, expected) in triggers {
            assert_eq!(serde_json::to_value(trigger).unwrap(), expected);
        }
    }
}
