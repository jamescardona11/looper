use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::core::hotkeys;
use crate::dictionary::{sanitize_dictionary_entries, sanitize_replacements};
use crate::personalization::sanitize_personalities;
use crate::settings::{ShortcutBinding, TranscriptionMode, UserSettings};
use crate::{model_manager, AppRuntime, AppState};

use super::detect::parse_app;
use super::shared::{resolve_looper_model, ImportBundle};

fn selected_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSelections {
    #[serde(default = "selected_by_default")]
    pub dictionary: bool,
    #[serde(default = "selected_by_default")]
    pub replacements: bool,
    #[serde(default = "selected_by_default")]
    pub personalities: bool,
    #[serde(default = "selected_by_default")]
    pub shortcut: bool,
    #[serde(default = "selected_by_default")]
    pub language: bool,
    #[serde(default = "selected_by_default")]
    pub auto_launch: bool,
    #[serde(default = "selected_by_default")]
    pub model: bool,
    #[serde(default = "selected_by_default")]
    pub history: bool,
}

impl Default for ImportSelections {
    fn default() -> Self {
        Self {
            dictionary: true,
            replacements: true,
            personalities: true,
            shortcut: true,
            language: true,
            auto_launch: true,
            model: true,
            history: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub dictionary_added: usize,
    pub replacements_added: usize,
    pub personalities_added: usize,
    pub shortcut_applied: bool,
    pub shortcut: Option<String>,
    pub language_applied: bool,
    pub auto_launch_applied: bool,
    pub auto_launch: Option<bool>,
    pub model_key: Option<String>,
    pub model_unrecognized: bool,
    pub transcripts_added: usize,
}

struct SettingsMerger<'a> {
    bundle: &'a ImportBundle,
    selections: &'a ImportSelections,
}

impl<'a> SettingsMerger<'a> {
    fn new(bundle: &'a ImportBundle, selections: &'a ImportSelections) -> Self {
        Self { bundle, selections }
    }

    fn merge(
        self,
        settings: &mut UserSettings,
        load_model_keys: impl FnOnce() -> Vec<String>,
    ) -> ImportResult {
        let mut result = ImportResult::default();
        self.merge_dictionary(settings, &mut result);
        self.merge_replacements(settings, &mut result);
        self.merge_personalities(settings, &mut result);
        self.apply_shortcut(settings, &mut result);
        self.apply_language(settings, &mut result);
        self.apply_auto_launch(settings, &mut result);
        self.apply_model(settings, &mut result, load_model_keys);
        result
    }

    fn merge_dictionary(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.dictionary || self.bundle.dictionary.is_empty() {
            return;
        }
        let previous_count = settings.dictionary.len();
        let candidates = settings
            .dictionary
            .iter()
            .cloned()
            .chain(self.bundle.dictionary.iter().cloned())
            .collect::<Vec<_>>();
        settings.dictionary = sanitize_dictionary_entries(&candidates);
        result.dictionary_added = settings.dictionary.len().saturating_sub(previous_count);
    }

    fn merge_replacements(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.replacements || self.bundle.replacements.is_empty() {
            return;
        }
        let previous_count = settings.replacements.len();
        let candidates = settings
            .replacements
            .iter()
            .cloned()
            .chain(self.bundle.replacements.iter().cloned())
            .collect::<Vec<_>>();
        settings.replacements = sanitize_replacements(&candidates);
        result.replacements_added = settings.replacements.len().saturating_sub(previous_count);
    }

    fn merge_personalities(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.personalities || self.bundle.personalities.is_empty() {
            return;
        }
        let previous_count = settings.personalities.len();
        let candidates = settings
            .personalities
            .iter()
            .cloned()
            .chain(self.bundle.personalities.iter().cloned())
            .collect::<Vec<_>>();
        settings.personalities = sanitize_personalities(&candidates);
        result.personalities_added = settings.personalities.len().saturating_sub(previous_count);
    }

    fn apply_shortcut(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.shortcut {
            return;
        }
        let Some(raw_shortcut) = self.bundle.smart_shortcut.as_deref() else {
            return;
        };
        let Ok(shortcut) = hotkeys::parse_shortcut(raw_shortcut) else {
            return;
        };
        if hotkeys::validate_recording_shortcut(&shortcut).is_err() {
            return;
        }

        let canonical = shortcut.to_string();
        let cleanup_enabled = settings
            .shortcut_bindings
            .smart
            .first()
            .is_some_and(|binding| binding.cleanup_enabled);
        settings.smart_shortcut = canonical.clone();
        settings.smart_enabled = true;
        settings.shortcut_bindings.smart = vec![ShortcutBinding {
            shortcut: canonical.clone(),
            temporary: false,
            cleanup_enabled,
        }];
        result.shortcut = Some(canonical);
        result.shortcut_applied = true;
    }

    fn apply_language(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.language {
            return;
        }
        let Some(language) = self
            .bundle
            .language
            .as_deref()
            .filter(|language| !language.is_empty())
        else {
            return;
        };
        settings.language = language.to_string();
        result.language_applied = true;
    }

    fn apply_auto_launch(&self, settings: &mut UserSettings, result: &mut ImportResult) {
        if !self.selections.auto_launch {
            return;
        }
        let Some(enabled) = self.bundle.auto_launch else {
            return;
        };
        settings.auto_launch_enabled = enabled;
        settings.start_in_background = enabled && settings.start_in_background;
        result.auto_launch = Some(enabled);
        result.auto_launch_applied = true;
    }

    fn apply_model(
        &self,
        settings: &mut UserSettings,
        result: &mut ImportResult,
        load_model_keys: impl FnOnce() -> Vec<String>,
    ) {
        if !self.selections.model {
            return;
        }
        let Some(hint) = self.bundle.model_hint.as_ref() else {
            return;
        };
        let Some(family) = hint.family else {
            result.model_unrecognized = true;
            return;
        };

        match resolve_looper_model(family, &load_model_keys()) {
            Some(key) => {
                settings.local_model = key.clone();
                settings.transcription_mode = TranscriptionMode::Local;
                result.model_key = Some(key);
            }
            None => result.model_unrecognized = true,
        }
    }
}

#[derive(Clone, Copy)]
struct LaunchTransition {
    before: bool,
    after: bool,
}

impl LaunchTransition {
    fn between(before: bool, after: bool) -> Self {
        Self { before, after }
    }

    fn changed(self) -> bool {
        self.before != self.after
    }

    fn apply(self, app: &AppHandle<AppRuntime>) -> Result<(), String> {
        if self.changed() {
            crate::sync_launch_at_login(app, self.after)?;
        }
        Ok(())
    }

    fn rollback(self, app: &AppHandle<AppRuntime>) {
        if self.changed() {
            let _ = crate::sync_launch_at_login(app, self.before);
        }
    }
}

pub fn apply_import(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    id: &str,
    home: &Path,
    selections: &ImportSelections,
) -> Result<ImportResult, String> {
    let bundle = parse_app(id, home)?;
    let mut settings = state.current_settings_unmasked();
    let previous_settings = settings.clone();

    let mut result = SettingsMerger::new(&bundle, selections).merge(&mut settings, || {
        model_manager::list_models()
            .into_iter()
            .map(|model| model.key)
            .collect()
    });

    let launch = LaunchTransition::between(
        previous_settings.auto_launch_enabled,
        settings.auto_launch_enabled,
    );
    launch.apply(app)?;

    let persisted = match state.persist_settings(settings) {
        Ok(settings) => settings,
        Err(error) => {
            launch.rollback(app);
            return Err(error.to_string());
        }
    };
    crate::analytics::track_settings_changes(app, &previous_settings, &persisted);
    state.emit_settings_changed(app, &persisted);

    if selections.history && !bundle.transcripts.is_empty() {
        result.transcripts_added = state
            .storage()
            .import_transcriptions(&bundle.transcripts)
            .map_err(|error| error.to_string())?;
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use serde_json::json;

    use super::super::shared::{ModelFamily, ModelHint};
    use super::*;
    use crate::settings::{Personality, Replacement};
    use crate::storage::{ImportedTranscription, StorageManager};

    fn imported_bundle() -> ImportBundle {
        ImportBundle {
            dictionary: vec![" Looper ".to_string(), "Parakeet".to_string()],
            replacements: vec![Replacement {
                from: "loop er".to_string(),
                to: "Looper".to_string(),
            }],
            personalities: vec![Personality {
                id: "imported-mode".to_string(),
                name: "Imported Mode".to_string(),
                enabled: true,
                apps: Vec::new(),
                websites: Vec::new(),
                instructions: vec!["Keep it concise".to_string()],
            }],
            smart_shortcut: Some("Control+Shift+K".to_string()),
            language: Some("es".to_string()),
            auto_launch: Some(false),
            model_hint: Some(ModelHint {
                source_id: "whisper-small".to_string(),
                family: Some(ModelFamily::WhisperSmall),
            }),
            transcripts: vec![ImportedTranscription {
                text: "imported history".to_string(),
                timestamp_ms: 1_700_000_000_000,
            }],
            transcript_count: 1,
        }
    }

    #[test]
    fn missing_selection_fields_default_to_selected() {
        let selections: ImportSelections = serde_json::from_value(json!({
            "personalities": false,
            "autoLaunch": false
        }))
        .unwrap();

        assert!(selections.dictionary);
        assert!(selections.replacements);
        assert!(!selections.personalities);
        assert!(selections.shortcut);
        assert!(selections.language);
        assert!(!selections.auto_launch);
        assert!(selections.model);
        assert!(selections.history);
    }

    #[test]
    fn settings_merger_applies_selected_categories_and_counts_additions() {
        let mut settings = UserSettings::default();
        settings.dictionary = vec!["Looper".to_string()];
        settings.auto_launch_enabled = true;
        settings.start_in_background = true;
        settings.shortcut_bindings.smart[0].cleanup_enabled = true;
        let model_loader_called = Cell::new(false);

        let result = SettingsMerger::new(&imported_bundle(), &ImportSelections::default()).merge(
            &mut settings,
            || {
                model_loader_called.set(true);
                vec!["whisper-small".to_string()]
            },
        );

        assert_eq!(result.dictionary_added, 1);
        assert_eq!(result.replacements_added, 1);
        assert_eq!(result.personalities_added, 1);
        assert!(result.shortcut_applied);
        assert_eq!(settings.shortcut_bindings.smart.len(), 1);
        assert!(settings.shortcut_bindings.smart[0].cleanup_enabled);
        assert_eq!(settings.language, "es");
        assert!(result.language_applied);
        assert_eq!(result.auto_launch, Some(false));
        assert!(!settings.auto_launch_enabled);
        assert!(!settings.start_in_background);
        assert_eq!(result.model_key.as_deref(), Some("whisper-small"));
        assert!(model_loader_called.get());
    }

    #[test]
    fn unselected_model_does_not_enumerate_models_or_change_settings() {
        let mut settings = UserSettings::default();
        let original_model = settings.local_model.clone();
        let mut selections = ImportSelections::default();
        selections.model = false;
        let called = Cell::new(false);

        let result =
            SettingsMerger::new(&imported_bundle(), &selections).merge(&mut settings, || {
                called.set(true);
                Vec::new()
            });

        assert!(!called.get());
        assert_eq!(settings.local_model, original_model);
        assert_eq!(result.model_key, None);
        assert!(!result.model_unrecognized);
    }

    #[test]
    fn unknown_selected_model_is_reported_without_changing_local_model() {
        let mut bundle = imported_bundle();
        bundle.model_hint.as_mut().unwrap().family = None;
        let mut settings = UserSettings::default();
        let original_model = settings.local_model.clone();

        let result = SettingsMerger::new(&bundle, &ImportSelections::default())
            .merge(&mut settings, Vec::new);

        assert!(result.model_unrecognized);
        assert_eq!(result.model_key, None);
        assert_eq!(settings.local_model, original_model);
    }

    #[test]
    fn result_wire_contract_keeps_camel_case_and_nulls() {
        let value = serde_json::to_value(ImportResult::default()).unwrap();
        assert_eq!(
            value,
            json!({
                "dictionaryAdded": 0,
                "replacementsAdded": 0,
                "personalitiesAdded": 0,
                "shortcutApplied": false,
                "shortcut": null,
                "languageApplied": false,
                "autoLaunchApplied": false,
                "autoLaunch": null,
                "modelKey": null,
                "modelUnrecognized": false,
                "transcriptsAdded": 0
            })
        );
    }

    #[test]
    fn sqlite_history_import_deduplicates_existing_timestamp_and_text() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("history.sqlite3")).unwrap();
        let history = imported_bundle().transcripts;

        assert_eq!(storage.import_transcriptions(&history).unwrap(), 1);
        assert_eq!(storage.import_transcriptions(&history).unwrap(), 0);
        let records = storage.get_all().unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].text, "imported history");
        assert_eq!(records[0].timestamp.timestamp_millis(), 1_700_000_000_000);
    }
}
