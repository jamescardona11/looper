use std::path::Path;

use serde::{Deserialize, Serialize};

use super::shared::{normalize_language, ImportBundle};
use super::{aqua, superwhisper};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedApp {
    pub id: String,
    pub name: String,
}

type Detector = fn(&Path) -> bool;
type Parser = fn(&Path) -> Result<ImportBundle, String>;

#[derive(Clone, Copy)]
struct ImportSource {
    id: &'static str,
    display_name: &'static str,
    detect: Detector,
    parse: Parser,
}

const SOURCES: [ImportSource; 2] = [
    ImportSource {
        id: aqua::ID,
        display_name: aqua::DISPLAY_NAME,
        detect: aqua::detect,
        parse: aqua::parse,
    },
    ImportSource {
        id: superwhisper::ID,
        display_name: superwhisper::DISPLAY_NAME,
        detect: superwhisper::detect,
        parse: superwhisper::parse,
    },
];

pub fn detect_apps(home: &Path) -> Vec<DetectedApp> {
    SOURCES
        .iter()
        .filter(|source| (source.detect)(home))
        .filter_map(|source| {
            let bundle = (source.parse)(home).ok()?;
            bundle_has_importable_content(&bundle).then(|| source.detected_app())
        })
        .collect()
}

impl ImportSource {
    fn detected_app(self) -> DetectedApp {
        DetectedApp {
            id: self.id.to_string(),
            name: self.display_name.to_string(),
        }
    }
}

fn bundle_has_importable_content(bundle: &ImportBundle) -> bool {
    !bundle.dictionary.is_empty()
        || !bundle.replacements.is_empty()
        || !bundle.personalities.is_empty()
        || !bundle.transcripts.is_empty()
        || bundle.smart_shortcut.is_some()
        || bundle.language.is_some()
        || bundle.auto_launch.is_some()
        || bundle.model_hint.is_some()
}

fn source_by_id(id: &str) -> Option<ImportSource> {
    SOURCES.iter().copied().find(|source| source.id == id)
}

pub fn display_name(id: &str) -> &'static str {
    source_by_id(id)
        .map(|source| source.display_name)
        .unwrap_or("Unknown app")
}

pub fn parse_app(id: &str, home: &Path) -> Result<ImportBundle, String> {
    let source = source_by_id(id).ok_or_else(|| format!("Unknown import source: {id}"))?;
    let bundle = (source.parse)(home)?;
    Ok(finalize_bundle(bundle))
}

fn finalize_bundle(mut bundle: ImportBundle) -> ImportBundle {
    bundle.language = bundle.language.as_deref().and_then(normalize_language);
    bundle.transcript_count = bundle.transcripts.len() as u32;
    bundle
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::storage::ImportedTranscription;

    #[test]
    fn source_catalog_keeps_detection_and_menu_order() {
        let catalog: Vec<_> = SOURCES
            .iter()
            .map(|source| (source.id, source.display_name))
            .collect();
        assert_eq!(
            catalog,
            vec![
                ("aqua", "Aqua Voice"),
                ("superwhisper", "superwhisper"),
            ]
        );
    }

    #[test]
    fn bundle_content_policy_counts_each_importable_category() {
        assert!(!bundle_has_importable_content(&ImportBundle::default()));

        let candidates = [
            ImportBundle {
                dictionary: vec!["term".to_string()],
                ..Default::default()
            },
            ImportBundle {
                smart_shortcut: Some("Super+Space".to_string()),
                ..Default::default()
            },
            ImportBundle {
                transcripts: vec![ImportedTranscription {
                    text: "history".to_string(),
                    timestamp_ms: 1,
                }],
                ..Default::default()
            },
        ];
        assert!(candidates.iter().all(bundle_has_importable_content));
    }

    #[test]
    fn bundle_finalization_normalizes_language_and_recounts_history() {
        let bundle = finalize_bundle(ImportBundle {
            language: Some("Spanish".to_string()),
            transcripts: vec![
                ImportedTranscription {
                    text: "first".to_string(),
                    timestamp_ms: 2,
                },
                ImportedTranscription {
                    text: "second".to_string(),
                    timestamp_ms: 1,
                },
            ],
            transcript_count: 99,
            ..Default::default()
        });
        assert_eq!(bundle.language.as_deref(), Some("es"));
        assert_eq!(bundle.transcript_count, 2);
    }

    #[test]
    fn aqua_fixture_is_detected_through_the_public_catalog() {
        let home = tempfile::tempdir().unwrap();
        let settings =
            super::super::shared::app_support_dir(home.path(), "Aqua Voice").join("settings.json");
        std::fs::create_dir_all(settings.parent().unwrap()).unwrap();
        std::fs::write(
            settings,
            serde_json::to_vec(&json!({ "dictionary": ["Looper"] })).unwrap(),
        )
        .unwrap();

        let detected = detect_apps(home.path());
        assert_eq!(detected.len(), 1);
        assert_eq!(detected[0].id, "aqua");
        assert_eq!(detected[0].name, "Aqua Voice");
    }

    #[test]
    fn unknown_source_keeps_public_name_and_error() {
        let home = tempfile::tempdir().unwrap();
        assert_eq!(display_name("missing"), "Unknown app");
        assert_eq!(
            parse_app("missing", home.path()).unwrap_err(),
            "Unknown import source: missing"
        );
    }

    #[test]
    fn detected_app_wire_contract_stays_id_and_name() {
        let value = serde_json::to_value(DetectedApp {
            id: "aqua".to_string(),
            name: "Aqua Voice".to_string(),
        })
        .unwrap();
        assert_eq!(value, json!({ "id": "aqua", "name": "Aqua Voice" }));
    }
}
