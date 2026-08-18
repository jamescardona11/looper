use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::{model_manager, AppRuntime, AppState};

use super::apply::{apply_import as execute_import, ImportResult, ImportSelections};
use super::detect::{detect_apps, display_name, parse_app, DetectedApp};
use super::shared::{resolve_looper_model, ImportBundle, ModelHint};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub id: String,
    pub name: String,
    pub dictionary_count: usize,
    pub replacements_count: usize,
    pub personalities_count: usize,
    pub shortcut: Option<String>,
    pub language: Option<String>,
    pub auto_launch: Option<bool>,
    pub model_source: Option<String>,
    pub model_key: Option<String>,
    pub model_recognized: bool,
    pub transcript_count: u32,
}

struct PreviewModel {
    source: Option<String>,
    key: Option<String>,
}

impl PreviewModel {
    fn resolve(hint: Option<&ModelHint>, available_keys: &[String]) -> Self {
        let Some(hint) = hint else {
            return Self {
                source: None,
                key: None,
            };
        };
        Self {
            source: Some(hint.source_id.clone()),
            key: hint
                .family
                .and_then(|family| resolve_looper_model(family, available_keys)),
        }
    }
}

impl ImportPreview {
    fn from_bundle(id: String, bundle: ImportBundle, available_keys: &[String]) -> Self {
        let model = PreviewModel::resolve(bundle.model_hint.as_ref(), available_keys);
        let model_recognized = model.key.is_some();

        Self {
            name: display_name(&id).to_string(),
            id,
            dictionary_count: bundle.dictionary.len(),
            replacements_count: bundle.replacements.len(),
            personalities_count: bundle.personalities.len(),
            shortcut: bundle.smart_shortcut,
            language: bundle.language,
            auto_launch: bundle.auto_launch,
            model_source: model.source,
            model_key: model.key,
            model_recognized,
            transcript_count: bundle.transcript_count,
        }
    }
}

fn home_directory(app: &AppHandle<AppRuntime>) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map_err(|error| format!("Could not resolve home directory: {error}"))
}

#[tauri::command]
pub fn detect_importable_apps(app: AppHandle<AppRuntime>) -> Result<Vec<DetectedApp>, String> {
    let home = home_directory(&app)?;
    Ok(detect_apps(&home))
}

#[tauri::command]
pub fn preview_import(app: AppHandle<AppRuntime>, id: String) -> Result<ImportPreview, String> {
    let home = home_directory(&app)?;
    let bundle = parse_app(&id, &home)?;
    let available_keys = model_keys_needed_by(&bundle);
    Ok(ImportPreview::from_bundle(id, bundle, &available_keys))
}

fn model_keys_needed_by(bundle: &ImportBundle) -> Vec<String> {
    if bundle
        .model_hint
        .as_ref()
        .and_then(|hint| hint.family)
        .is_none()
    {
        return Vec::new();
    }

    model_manager::list_models()
        .into_iter()
        .map(|model| model.key)
        .collect()
}

#[tauri::command]
pub fn apply_import(
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
    id: String,
    selections: Option<ImportSelections>,
) -> Result<ImportResult, String> {
    let home = home_directory(&app)?;
    let requested = selections.unwrap_or_default();
    execute_import(&app, &state, &id, &home, &requested)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::shared::{ModelFamily, ModelHint};
    use super::*;
    use crate::settings::{Personality, Replacement};
    use crate::storage::ImportedTranscription;

    fn bundle_with_every_category() -> ImportBundle {
        ImportBundle {
            dictionary: vec!["Looper".to_string(), "Parakeet".to_string()],
            replacements: vec![Replacement {
                from: "loop er".to_string(),
                to: "Looper".to_string(),
            }],
            personalities: vec![Personality {
                id: "notes".to_string(),
                name: "Notes".to_string(),
                enabled: true,
                apps: Vec::new(),
                websites: Vec::new(),
                instructions: Vec::new(),
            }],
            smart_shortcut: Some("Super+Space".to_string()),
            language: Some("es".to_string()),
            auto_launch: Some(true),
            model_hint: Some(ModelHint {
                source_id: "whisper-large-v3".to_string(),
                family: Some(ModelFamily::WhisperLarge),
            }),
            transcripts: vec![ImportedTranscription {
                text: "history".to_string(),
                timestamp_ms: 4,
            }],
            transcript_count: 1,
        }
    }

    #[test]
    fn preview_maps_counts_metadata_and_recognized_model() {
        let preview = ImportPreview::from_bundle(
            "wispr".to_string(),
            bundle_with_every_category(),
            &["whisper-large-v3".to_string()],
        );

        assert_eq!(preview.name, "Wispr Flow");
        assert_eq!(preview.dictionary_count, 2);
        assert_eq!(preview.replacements_count, 1);
        assert_eq!(preview.personalities_count, 1);
        assert_eq!(preview.transcript_count, 1);
        assert_eq!(preview.model_source.as_deref(), Some("whisper-large-v3"));
        assert_eq!(preview.model_key.as_deref(), Some("whisper-large-v3"));
        assert!(preview.model_recognized);
    }

    #[test]
    fn preview_keeps_source_when_model_family_is_unknown() {
        let mut bundle = ImportBundle::default();
        bundle.model_hint = Some(ModelHint {
            source_id: "custom-source".to_string(),
            family: None,
        });
        let preview = ImportPreview::from_bundle("handy".to_string(), bundle, &[]);

        assert_eq!(preview.model_source.as_deref(), Some("custom-source"));
        assert_eq!(preview.model_key, None);
        assert!(!preview.model_recognized);
    }

    #[test]
    fn preview_wire_contract_remains_camel_case_with_nullable_metadata() {
        let preview = ImportPreview::from_bundle("aqua".to_string(), ImportBundle::default(), &[]);
        let value = serde_json::to_value(preview).unwrap();

        assert_eq!(
            value,
            json!({
                "id": "aqua",
                "name": "Aqua Voice",
                "dictionaryCount": 0,
                "replacementsCount": 0,
                "personalitiesCount": 0,
                "shortcut": null,
                "language": null,
                "autoLaunch": null,
                "modelSource": null,
                "modelKey": null,
                "modelRecognized": false,
                "transcriptCount": 0
            })
        );
    }
}
