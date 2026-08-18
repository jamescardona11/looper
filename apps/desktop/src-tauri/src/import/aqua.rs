use std::path::{Path, PathBuf};

use serde_json::Value;
use uuid::Uuid;

use crate::settings::{Personality, Replacement};
use crate::storage::ImportedTranscription;

use super::shared::{
    app_support_dir, parse_datetime_millis, read_json, translate_accelerator, ImportBundle,
};

pub const ID: &str = "aqua";
pub const DISPLAY_NAME: &str = "Aqua Voice";

const HISTORY_TEXT_KEYS: [&str; 4] = ["text", "transcript", "result", "content"];
const HISTORY_TIME_KEYS: [&str; 4] = ["timestamp", "createdAt", "date", "time"];

struct AquaFiles {
    settings: PathBuf,
}

impl AquaFiles {
    fn under(home: &Path) -> Self {
        Self {
            settings: app_support_dir(home, "Aqua Voice").join("settings.json"),
        }
    }
}

struct AquaPreferences<'a> {
    root: &'a Value,
}

impl<'a> AquaPreferences<'a> {
    fn new(root: &'a Value) -> Self {
        Self { root }
    }

    fn into_bundle(self) -> ImportBundle {
        let mut bundle = ImportBundle::default();
        bundle.dictionary = self.string_values("dictionary");
        bundle.replacements = self.replacements();
        bundle.smart_shortcut = self.activation_shortcut();
        bundle.personalities = self.personality().into_iter().collect();
        bundle.language = self.nonempty_string("language").map(str::to_owned);
        bundle.auto_launch = self.root.get("startOnStartup").and_then(Value::as_bool);
        bundle.transcripts = self.history();
        bundle.transcript_count = bundle.transcripts.len() as u32;
        bundle
    }

    fn array(&self, key: &str) -> &[Value] {
        self.root
            .get(key)
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or_default()
    }

    fn string_values(&self, key: &str) -> Vec<String> {
        self.array(key)
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    }

    fn replacements(&self) -> Vec<Replacement> {
        self.array("replacements")
            .iter()
            .filter_map(|entry| {
                let from = entry.get("from")?.as_str()?.to_owned();
                let to = entry
                    .get("to")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                Some(Replacement { from, to })
            })
            .collect()
    }

    fn activation_shortcut(&self) -> Option<String> {
        self.array("hotkeys")
            .iter()
            .find(|hotkey| hotkey.get("action").and_then(Value::as_str) == Some("activate"))
            .and_then(|hotkey| hotkey.get("keys"))
            .and_then(Value::as_str)
            .and_then(translate_accelerator)
    }

    fn personality(&self) -> Option<Personality> {
        let instructions = self
            .root
            .get("customInstructions")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())?;
        Some(Personality {
            id: Uuid::new_v4().to_string(),
            name: DISPLAY_NAME.to_owned(),
            enabled: true,
            apps: Vec::new(),
            websites: Vec::new(),
            instructions: vec![instructions.to_owned()],
        })
    }

    fn nonempty_string(&self, key: &str) -> Option<&'a str> {
        self.root
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
    }

    fn history(&self) -> Vec<ImportedTranscription> {
        self.array("history")
            .iter()
            .filter_map(HistoryRecord::read)
            .collect()
    }
}

struct HistoryRecord;

impl HistoryRecord {
    fn read(entry: &Value) -> Option<ImportedTranscription> {
        let text = first_string(entry, &HISTORY_TEXT_KEYS)?.trim().to_owned();
        if text.is_empty() {
            return None;
        }

        let timestamp_ms = first_value(entry, &HISTORY_TIME_KEYS)
            .and_then(timestamp_millis)
            .unwrap_or_else(|| chrono::Local::now().timestamp_millis());
        Some(ImportedTranscription { text, timestamp_ms })
    }
}

fn first_string<'a>(source: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| source.get(*key).and_then(Value::as_str))
}

fn first_value<'a>(source: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| source.get(*key))
}

fn timestamp_millis(value: &Value) -> Option<i64> {
    match value {
        Value::String(text) => parse_datetime_millis(text),
        Value::Number(number) => number.as_i64().map(|raw| {
            if raw < 100_000_000_000 {
                raw * 1000
            } else {
                raw
            }
        }),
        _ => None,
    }
}

pub fn detect(home: &Path) -> bool {
    AquaFiles::under(home).settings.exists()
}

pub fn parse(home: &Path) -> Result<ImportBundle, String> {
    let files = AquaFiles::under(home);
    let root = read_json(&files.settings)
        .ok_or_else(|| "Could not read Aqua Voice settings".to_string())?;
    Ok(AquaPreferences::new(&root).into_bundle())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn fixture_preserves_all_settings_fields_and_history_order() {
        let temp = tempfile::tempdir().unwrap();
        let files = AquaFiles::under(temp.path());
        std::fs::create_dir_all(files.settings.parent().unwrap()).unwrap();
        std::fs::write(
            &files.settings,
            serde_json::to_vec(&json!({
                "dictionary": [" ECG ", 8, "beta-blocker"],
                "replacements": [
                    {"from": "qhs", "to": "cada noche"},
                    {"from": "bid"},
                    {"to": "inválida"}
                ],
                "hotkeys": [
                    {"action": "ignore", "keys": "ctrl+i"},
                    {"action": "activate", "keys": "ctrl+shift+a"}
                ],
                "customInstructions": "  Mantén términos clínicos.  ",
                "language": "es-CO",
                "startOnStartup": false,
                "history": [
                    {"text": "  primer texto  ", "timestamp": 1738605600},
                    {"transcript": "segundo texto", "createdAt": "2025-02-02T10:00:00Z"}
                ]
            }))
            .unwrap(),
        )
        .unwrap();

        let bundle = parse(temp.path()).unwrap();

        assert_eq!(bundle.dictionary, [" ECG ", "beta-blocker"]);
        assert_eq!(bundle.replacements.len(), 2);
        assert_eq!(bundle.replacements[1].to, "");
        assert_eq!(bundle.smart_shortcut.as_deref(), Some("Control+Shift+A"));
        assert_eq!(bundle.personalities.len(), 1);
        assert_eq!(
            bundle.personalities[0].instructions,
            ["Mantén términos clínicos."]
        );
        assert_eq!(bundle.language.as_deref(), Some("es-CO"));
        assert_eq!(bundle.auto_launch, Some(false));
        assert_eq!(bundle.transcript_count, 2);
        assert_eq!(bundle.transcripts[0].text, "primer texto");
        assert_eq!(bundle.transcripts[0].timestamp_ms, 1_738_605_600_000);
        assert_eq!(bundle.transcripts[1].text, "segundo texto");
    }

    #[test]
    fn an_empty_higher_priority_text_does_not_fall_through() {
        let entry = json!({"text": "  ", "transcript": "would be skipped"});

        assert!(HistoryRecord::read(&entry).is_none());
    }

    #[test]
    fn an_invalid_higher_priority_timestamp_uses_the_clock_fallback() {
        let entry = json!({
            "text": "texto",
            "timestamp": "not-a-date",
            "createdAt": 1_738_605_600_000_i64
        });
        let before = chrono::Local::now().timestamp_millis();

        let parsed = HistoryRecord::read(&entry).unwrap();
        let after = chrono::Local::now().timestamp_millis();

        assert!((before..=after).contains(&parsed.timestamp_ms));
    }

    #[test]
    fn missing_or_invalid_settings_keep_the_public_error() {
        let temp = tempfile::tempdir().unwrap();

        assert_eq!(
            parse(temp.path()).unwrap_err(),
            "Could not read Aqua Voice settings"
        );
    }
}
