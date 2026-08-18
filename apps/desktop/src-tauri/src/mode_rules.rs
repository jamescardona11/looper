//! Smart Modes (F5) Tauri commands: CRUD for `ModeRule` (same
//! read/sanitize/persist/emit shape as `personalization.rs`'s
//! `Personality` commands) plus `get_active_mode_rule_suggestion`, which
//! Selection Mode's pill calls to pre-select a default transform preset for
//! the frontmost app/site - see `mode_context::resolve_active_mode_rule`.

use std::collections::HashSet;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::mode_context;
use crate::selection_actions::TransformPreset;
use crate::settings::{
    ModeRule, ModeRuleTrigger, TranscriptionMode, UserSettings, WorkflowEngine, WorkflowInput,
    WorkflowOutput,
};
use crate::{AppRuntime, AppState, EVENT_SETTINGS_CHANGED};

const MAX_MODE_RULES: usize = 32;
const MAX_TRIGGER_VALUE_LEN: usize = 120;
const MAX_WORKFLOW_NAME_LEN: usize = 80;
const MAX_WORKFLOW_LANGUAGE_LEN: usize = 16;
const MAX_WORKFLOW_PROMPT_LEN: usize = 4_000;

fn sanitize_trigger(trigger: &ModeRuleTrigger) -> Option<ModeRuleTrigger> {
    match trigger {
        ModeRuleTrigger::BundleId { bundle_id } => {
            let trimmed: String = bundle_id
                .trim()
                .chars()
                .take(MAX_TRIGGER_VALUE_LEN)
                .collect();
            (!trimmed.is_empty()).then_some(ModeRuleTrigger::BundleId { bundle_id: trimmed })
        }
        ModeRuleTrigger::UrlPattern { url_pattern } => {
            let trimmed: String = url_pattern
                .trim()
                .to_lowercase()
                .chars()
                .take(MAX_TRIGGER_VALUE_LEN)
                .collect();
            (!trimmed.is_empty()).then_some(ModeRuleTrigger::UrlPattern {
                url_pattern: trimmed,
            })
        }
        ModeRuleTrigger::Field { field } => Some(ModeRuleTrigger::Field { field: *field }),
        ModeRuleTrigger::Hotkey { shortcut } => {
            let trimmed: String = shortcut
                .trim()
                .chars()
                .take(MAX_TRIGGER_VALUE_LEN)
                .collect();
            let valid = crate::core::hotkeys::parse_shortcut(&trimmed)
                .and_then(|hotkey| {
                    crate::core::hotkeys::validate_recording_shortcut(&hotkey).map(|_| hotkey)
                })
                .is_ok();
            valid.then_some(ModeRuleTrigger::Hotkey { shortcut: trimmed })
        }
        ModeRuleTrigger::Manual => Some(ModeRuleTrigger::Manual),
    }
}

fn bounded_optional(value: Option<&str>, max_chars: usize) -> Option<String> {
    let value = value?.trim();
    (!value.is_empty()).then(|| value.chars().take(max_chars).collect())
}

fn sanitize_output(output: &WorkflowOutput) -> WorkflowOutput {
    output.clone()
}

pub fn sanitize_mode_rules(entries: &[ModeRule]) -> Vec<ModeRule> {
    let mut seen_ids = HashSet::new();
    let mut cleaned = Vec::new();

    for entry in entries {
        let Some(trigger) = sanitize_trigger(&entry.trigger) else {
            continue;
        };

        let mut id = entry.id.trim().to_string();
        if id.is_empty() {
            id = Uuid::new_v4().to_string();
        }
        while !seen_ids.insert(id.to_lowercase()) {
            id = Uuid::new_v4().to_string();
        }

        cleaned.push(ModeRule {
            id,
            name: {
                let name: String = entry
                    .name
                    .trim()
                    .chars()
                    .take(MAX_WORKFLOW_NAME_LEN)
                    .collect();
                if name.is_empty() {
                    "Workflow".to_string()
                } else {
                    name
                }
            },
            enabled: entry.enabled,
            trigger,
            input: entry.input,
            engine: entry.engine,
            language: bounded_optional(entry.language.as_deref(), MAX_WORKFLOW_LANGUAGE_LEN),
            transform_preset: entry.transform_preset,
            custom_prompt: bounded_optional(
                entry.custom_prompt.as_deref(),
                MAX_WORKFLOW_PROMPT_LEN,
            ),
            deterministic_only: entry.deterministic_only,
            output: sanitize_output(&entry.output),
            auto_send_on_insert: entry.auto_send_on_insert,
        });

        if cleaned.len() >= MAX_MODE_RULES {
            break;
        }
    }

    cleaned
}

pub fn apply_workflow_runtime_settings(settings: &mut UserSettings, workflow: &ModeRule) {
    settings.active_workflow_id = Some(workflow.id.clone());
    match workflow.engine {
        WorkflowEngine::Auto => {}
        WorkflowEngine::Local => {
            settings.transcription_mode = TranscriptionMode::Local;
            settings.remote_speech_enabled = false;
        }
        WorkflowEngine::Cloud => settings.transcription_mode = TranscriptionMode::Cloud,
    }
    if let Some(language) = workflow.language.as_deref() {
        settings.language = language.to_string();
    }
    if matches!(workflow.input, WorkflowInput::Selection) {
        settings.edit_mode_enabled = true;
    }
    if workflow.deterministic_only {
        settings.cleanup_enabled = false;
    }
}

#[tauri::command]
pub fn get_mode_rules(state: tauri::State<AppState>) -> Result<Vec<ModeRule>, String> {
    let mut settings = state.current_settings();
    let cleaned = sanitize_mode_rules(&settings.mode_rules);
    if cleaned != settings.mode_rules {
        settings.mode_rules = cleaned.clone();
        state
            .persist_settings(settings)
            .map_err(|err| err.to_string())?;
    }
    Ok(cleaned)
}

#[tauri::command]
pub fn set_mode_rules(
    mode_rules: Vec<ModeRule>,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<Vec<ModeRule>, String> {
    let cleaned = sanitize_mode_rules(&mode_rules);
    let mut settings = state.current_settings();
    settings.mode_rules = cleaned.clone();
    let saved = state
        .persist_settings(settings)
        .map_err(|err| err.to_string())?;

    if let Err(err) = app.emit(EVENT_SETTINGS_CHANGED, &saved) {
        tracing::error!("Failed to emit settings change: {err}");
    }

    Ok(cleaned)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeRuleSuggestion {
    pub transform_preset: Option<TransformPreset>,
    pub auto_send_on_insert: bool,
}

/// Called by Selection Mode's pill (F5) right when the action selector
/// opens, to pre-select a default transform preset for the frontmost
/// app/site - the user can still pick a different preset manually
/// afterwards, this only sets the initial selection.
#[tauri::command]
pub fn get_active_mode_rule_suggestion(
    state: tauri::State<AppState>,
) -> Option<ModeRuleSuggestion> {
    let settings = state.current_settings();
    suggestion_with_voice_priority(
        state.pending_voice_preset(),
        mode_context::resolve_active_mode_rule(&settings).as_ref(),
    )
}

/// A preset spoken at the start of the instruction ("modo email ...", see
/// `selection_actions::parse_preset_command`, published by `transcribe.rs`
/// while the action selector is open) wins over the matching Smart Mode
/// rule's preset for the pill's pre-selection; `auto_send_on_insert` still
/// comes from the rule alone - a voice command never turns it on.
fn suggestion_with_voice_priority(
    voice_preset: Option<TransformPreset>,
    rule: Option<&ModeRule>,
) -> Option<ModeRuleSuggestion> {
    if voice_preset.is_none() && rule.is_none() {
        return None;
    }
    Some(ModeRuleSuggestion {
        transform_preset: voice_preset.or_else(|| rule.and_then(|r| r.transform_preset)),
        auto_send_on_insert: rule.is_some_and(|r| r.auto_send_on_insert),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle_rule(id: &str, bundle_id: &str) -> ModeRule {
        ModeRule {
            id: id.to_string(),
            name: "Workflow".to_string(),
            enabled: true,
            trigger: ModeRuleTrigger::BundleId {
                bundle_id: bundle_id.to_string(),
            },
            input: WorkflowInput::Dictation,
            engine: WorkflowEngine::Auto,
            language: None,
            transform_preset: None,
            custom_prompt: None,
            deterministic_only: false,
            output: WorkflowOutput::Insert,
            auto_send_on_insert: false,
        }
    }

    #[test]
    fn drops_rules_with_an_empty_trigger_value() {
        let rules = vec![bundle_rule("a", "  "), bundle_rule("b", "com.apple.Safari")];
        let cleaned = sanitize_mode_rules(&rules);
        assert_eq!(cleaned.len(), 1);
        assert_eq!(
            cleaned[0].trigger,
            ModeRuleTrigger::BundleId {
                bundle_id: "com.apple.Safari".to_string()
            }
        );
    }

    #[test]
    fn assigns_ids_and_dedupes_collisions() {
        let rules = vec![
            bundle_rule("", "com.apple.Safari"),
            bundle_rule("", "com.google.Chrome"),
        ];
        let cleaned = sanitize_mode_rules(&rules);
        assert_eq!(cleaned.len(), 2);
        assert!(!cleaned[0].id.is_empty());
        assert!(!cleaned[1].id.is_empty());
        assert_ne!(cleaned[0].id, cleaned[1].id);
    }

    #[test]
    fn caps_at_max_mode_rules() {
        let rules: Vec<ModeRule> = (0..(MAX_MODE_RULES + 5))
            .map(|i| bundle_rule(&format!("rule-{i}"), &format!("com.example.app{i}")))
            .collect();
        let cleaned = sanitize_mode_rules(&rules);
        assert_eq!(cleaned.len(), MAX_MODE_RULES);
    }

    #[test]
    fn suggestion_prefers_the_voice_preset_but_keeps_the_rules_auto_send() {
        let mut rule = bundle_rule("a", "com.apple.Safari");
        rule.transform_preset = Some(TransformPreset::Chat);
        rule.auto_send_on_insert = true;

        let suggestion =
            suggestion_with_voice_priority(Some(TransformPreset::Email), Some(&rule)).unwrap();
        assert_eq!(suggestion.transform_preset, Some(TransformPreset::Email));
        assert!(suggestion.auto_send_on_insert);
    }

    #[test]
    fn suggestion_from_voice_alone_never_turns_on_auto_send() {
        let suggestion =
            suggestion_with_voice_priority(Some(TransformPreset::Polish), None).unwrap();
        assert_eq!(suggestion.transform_preset, Some(TransformPreset::Polish));
        assert!(!suggestion.auto_send_on_insert);
    }

    #[test]
    fn suggestion_without_voice_preset_falls_back_to_the_rule() {
        let mut rule = bundle_rule("a", "com.apple.Safari");
        rule.transform_preset = Some(TransformPreset::Chat);

        let suggestion = suggestion_with_voice_priority(None, Some(&rule)).unwrap();
        assert_eq!(suggestion.transform_preset, Some(TransformPreset::Chat));
        assert!(!suggestion.auto_send_on_insert);
    }

    #[test]
    fn no_voice_preset_and_no_rule_yields_no_suggestion() {
        assert!(suggestion_with_voice_priority(None, None).is_none());
    }

    #[test]
    fn lowercases_and_trims_url_patterns() {
        let rule = ModeRule {
            id: "rule".to_string(),
            name: "Website".to_string(),
            enabled: true,
            trigger: ModeRuleTrigger::UrlPattern {
                url_pattern: "  GitHub.COM  ".to_string(),
            },
            input: WorkflowInput::Dictation,
            engine: WorkflowEngine::Auto,
            language: None,
            transform_preset: None,
            custom_prompt: None,
            deterministic_only: false,
            output: WorkflowOutput::Insert,
            auto_send_on_insert: false,
        };
        let cleaned = sanitize_mode_rules(&[rule]);
        assert_eq!(
            cleaned[0].trigger,
            ModeRuleTrigger::UrlPattern {
                url_pattern: "github.com".to_string()
            }
        );
    }

    #[test]
    fn old_smart_mode_json_receives_workflow_defaults() {
        let rule: ModeRule = serde_json::from_value(serde_json::json!({
            "id": "legacy",
            "enabled": true,
            "trigger": { "type": "bundle_id", "bundle_id": "com.apple.Mail" },
            "transform_preset": "email",
            "auto_send_on_insert": false
        }))
        .unwrap();

        assert_eq!(rule.input, WorkflowInput::Dictation);
        assert_eq!(rule.engine, WorkflowEngine::Auto);
        assert_eq!(rule.output, WorkflowOutput::Insert);
        assert!(rule.name.is_empty());
    }

    #[test]
    fn workflow_runtime_overrides_are_ephemeral_and_bounded() {
        let mut rule = bundle_rule("workflow", "com.apple.Mail");
        rule.name = "  Email workflow  ".to_string();
        rule.engine = WorkflowEngine::Cloud;
        rule.input = WorkflowInput::Selection;
        rule.language = Some("  es-CO  ".to_string());
        rule.custom_prompt = Some("  Make it concise.  ".to_string());
        let cleaned = sanitize_mode_rules(&[rule]);
        let workflow = &cleaned[0];
        assert_eq!(workflow.name, "Email workflow");
        assert_eq!(workflow.language.as_deref(), Some("es-CO"));
        assert_eq!(workflow.custom_prompt.as_deref(), Some("Make it concise."));

        let mut settings = UserSettings::default();
        apply_workflow_runtime_settings(&mut settings, workflow);
        assert_eq!(settings.active_workflow_id.as_deref(), Some("workflow"));
        assert_eq!(settings.transcription_mode, TranscriptionMode::Cloud);
        assert_eq!(settings.language, "es-CO");
        assert!(settings.edit_mode_enabled);
    }
}
