use std::path::{Path, PathBuf};

use serde_json::Value;
use uuid::Uuid;

use crate::settings::{AppBinding, Personality, Replacement};
use crate::storage::ImportedTranscription;

use super::shared::{
    app_support_dir, dedup_transcripts, map_model_family, open_sqlite_readonly,
    parse_datetime_millis, read_json, sqlite_table_exists, ImportBundle, ModelHint,
};

pub const ID: &str = "superwhisper";
pub const DISPLAY_NAME: &str = "superwhisper";

const RECORDING_TEXT_KEYS: [&str; 4] = ["result", "text", "llmResult", "processedResult"];
const RECORDING_TIME_KEYS: [&str; 3] = ["datetime", "timestamp", "date"];

#[cfg(target_os = "windows")]
fn legacy_root(home: &Path) -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("AppData").join("Local"))
        .join("com.superwhisper.app")
}

#[cfg(not(target_os = "windows"))]
fn legacy_root(home: &Path) -> PathBuf {
    home.join("Documents").join("superwhisper")
}

#[cfg(target_os = "windows")]
fn legacy_settings(root: &Path) -> PathBuf {
    root.join("settings.json")
}

#[cfg(not(target_os = "windows"))]
fn legacy_settings(root: &Path) -> PathBuf {
    root.join("settings").join("settings.json")
}

struct SuperwhisperFiles {
    settings: PathBuf,
    modes: PathBuf,
    recordings: PathBuf,
    current_database: PathBuf,
}

impl SuperwhisperFiles {
    fn under(home: &Path) -> Self {
        let root = legacy_root(home);
        Self {
            settings: legacy_settings(&root),
            modes: root.join("modes"),
            recordings: root.join("recordings"),
            current_database: app_support_dir(home, DISPLAY_NAME)
                .join("database")
                .join("superwhisper.sqlite"),
        }
    }

    fn has_source(&self) -> bool {
        self.settings.exists()
            || self.modes.is_dir()
            || self.recordings.is_dir()
            || self.current_database.exists()
    }
}

struct SettingsDocument<'a> {
    root: &'a Value,
}

impl<'a> SettingsDocument<'a> {
    fn apply(&self, bundle: &mut ImportBundle) {
        bundle.dictionary = string_list(self.root.get("vocabulary"));
        bundle.replacements = self
            .root
            .get("replacements")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(replacement)
            .collect();
        bundle.model_hint = self.favorite_model().map(model_hint);
    }

    fn favorite_model(&self) -> Option<&'a str> {
        self.root
            .get("favoriteModelIDs")
            .and_then(Value::as_array)
            .and_then(|models| models.first())
            .and_then(Value::as_str)
    }
}

struct ModeDocument<'a> {
    root: &'a Value,
}

impl<'a> ModeDocument<'a> {
    fn contribute_to(&self, bundle: &mut ImportBundle) {
        let Some(personality) = self.personality() else {
            return;
        };
        bundle.personalities.push(personality);

        if bundle.language.is_none() {
            bundle.language = self.nonempty("language").map(str::to_owned);
        }
        if bundle.model_hint.is_none() {
            bundle.model_hint = self.nonempty("voiceModelID").map(model_hint);
        }
    }

    fn personality(&self) -> Option<Personality> {
        let name = self.root.get("name")?.as_str()?.trim().to_owned();
        if name.is_empty() {
            return None;
        }
        let prompt = self
            .root
            .get("prompt")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty());
        let apps: Vec<_> = string_list(self.root.get("activationApps"))
            .into_iter()
            .map(AppBinding::legacy)
            .collect();
        let websites = string_list(self.root.get("activationSites"));
        if prompt.is_none() && apps.is_empty() && websites.is_empty() {
            return None;
        }

        Some(Personality {
            id: Uuid::new_v4().to_string(),
            name,
            enabled: true,
            apps,
            websites,
            instructions: prompt.map(|text| vec![text.to_owned()]).unwrap_or_default(),
        })
    }

    fn nonempty(&self, key: &str) -> Option<&'a str> {
        self.root
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
    }
}

struct RecordingMetadata<'a> {
    root: &'a Value,
}

impl RecordingMetadata<'_> {
    fn transcription(&self) -> Option<ImportedTranscription> {
        let text = first_string(self.root, &RECORDING_TEXT_KEYS)?
            .trim()
            .to_owned();
        if text.is_empty() {
            return None;
        }
        let timestamp_ms = first_present(self.root, &RECORDING_TIME_KEYS)
            .and_then(timestamp_millis)
            .unwrap_or_else(|| chrono::Local::now().timestamp_millis());
        Some(ImportedTranscription { text, timestamp_ms })
    }
}

fn import_modes(directory: &Path, bundle: &mut ImportBundle) {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        if let Some(root) = read_json(&path) {
            ModeDocument { root: &root }.contribute_to(bundle);
        }
    }
}

fn recording_files(directory: &Path) -> Vec<ImportedTranscription> {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| read_recording(&path.join("meta.json")))
        .collect()
}

fn read_recording(path: &Path) -> Option<ImportedTranscription> {
    let root = read_json(path)?;
    RecordingMetadata { root: &root }.transcription()
}

fn database_history(path: &Path) -> Vec<ImportedTranscription> {
    if !path.exists() {
        return Vec::new();
    }
    let Ok((connection, _guard)) = open_sqlite_readonly(path) else {
        return Vec::new();
    };
    if !(sqlite_table_exists(&connection, "recording")
        && sqlite_table_exists(&connection, "recording_fts"))
    {
        return Vec::new();
    }

    let sql = "SELECT COALESCE(
                    NULLIF(TRIM(fts.result), ''),
                    NULLIF(TRIM(fts.llmResult), ''),
                    NULLIF(TRIM(fts.rawResult), '')
                ) AS text, recording.datetime
         FROM recording
         LEFT JOIN recording_fts fts ON fts.recordingId = recording.id
         WHERE text IS NOT NULL
         ORDER BY recording.datetime DESC";
    let Ok(mut statement) = connection.prepare(sql) else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?,
            row.get::<_, Option<String>>(1)?,
        ))
    }) else {
        return Vec::new();
    };

    rows.flatten()
        .filter_map(|(text, created)| database_item(text, created.as_deref()))
        .collect()
}

fn database_item(text: Option<String>, created: Option<&str>) -> Option<ImportedTranscription> {
    let text = text?.trim().to_owned();
    if text.is_empty() {
        return None;
    }
    let timestamp_ms = created
        .and_then(parse_datetime_millis)
        .unwrap_or_else(|| chrono::Local::now().timestamp_millis());
    Some(ImportedTranscription { text, timestamp_ms })
}

fn replacement(entry: &Value) -> Option<Replacement> {
    let from = first_present(entry, &["from", "original"])?.as_str()?;
    let to = first_present(entry, &["to", "replacement", "with"])
        .and_then(Value::as_str)
        .unwrap_or_default();
    Some(Replacement {
        from: from.to_owned(),
        to: to.to_owned(),
    })
}

fn model_hint(source_id: &str) -> ModelHint {
    ModelHint {
        source_id: source_id.to_owned(),
        family: map_model_family(source_id),
    }
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .collect()
}

fn first_string<'a>(source: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| source.get(*key).and_then(Value::as_str))
}

fn first_present<'a>(source: &'a Value, keys: &[&str]) -> Option<&'a Value> {
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
    SuperwhisperFiles::under(home).has_source()
}

pub fn parse(home: &Path) -> Result<ImportBundle, String> {
    let files = SuperwhisperFiles::under(home);
    let mut bundle = ImportBundle::default();

    if let Some(root) = read_json(&files.settings) {
        SettingsDocument { root: &root }.apply(&mut bundle);
    }
    import_modes(&files.modes, &mut bundle);
    bundle.transcripts = recording_files(&files.recordings);
    bundle
        .transcripts
        .extend(database_history(&files.current_database));
    dedup_transcripts(&mut bundle.transcripts);
    bundle.transcript_count = bundle.transcripts.len() as u32;
    Ok(bundle)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use super::*;

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn fixture_combines_settings_mode_recording_and_current_database() {
        let temp = tempfile::tempdir().unwrap();
        let files = SuperwhisperFiles::under(temp.path());
        std::fs::create_dir_all(files.settings.parent().unwrap()).unwrap();
        std::fs::write(
            &files.settings,
            serde_json::to_vec(&json!({
                "vocabulary": [" ECG ", "", 9, "metoprolol"],
                "replacements": [
                    {"original": "qhs", "with": "cada noche"},
                    {"from": "bid"}
                ],
                "favoriteModelIDs": ["parakeet-tdt-0.6b", "whisper-large-v3"]
            }))
            .unwrap(),
        )
        .unwrap();

        std::fs::create_dir_all(&files.modes).unwrap();
        std::fs::write(
            files.modes.join("clinical.json"),
            serde_json::to_vec(&json!({
                "name": "  Nota clínica  ",
                "prompt": "  Mantén los acrónimos.  ",
                "activationApps": ["Notes", "", 3],
                "activationSites": ["ehr.example.com"],
                "language": "es-CO",
                "voiceModelID": "whisper-small"
            }))
            .unwrap(),
        )
        .unwrap();
        std::fs::write(files.modes.join("ignored.JSON"), b"{}").unwrap();

        let recording_dir = files.recordings.join("recording-a");
        std::fs::create_dir_all(&recording_dir).unwrap();
        std::fs::write(
            recording_dir.join("meta.json"),
            serde_json::to_vec(&json!({
                "result": "  dictado duplicado  ",
                "datetime": "2025-02-03T10:00:00Z"
            }))
            .unwrap(),
        )
        .unwrap();

        std::fs::create_dir_all(files.current_database.parent().unwrap()).unwrap();
        let connection = Connection::open(&files.current_database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE recording (id TEXT, datetime TEXT);\
                 CREATE TABLE recording_fts (\
                    recordingId TEXT, result TEXT, llmResult TEXT, rawResult TEXT\
                 );\
                 INSERT INTO recording VALUES ('fresh', '2025-02-04T10:00:00Z');\
                 INSERT INTO recording_fts VALUES ('fresh', NULL, 'desde base', NULL);\
                 INSERT INTO recording VALUES ('duplicate', '2025-02-03T10:00:00Z');\
                 INSERT INTO recording_fts VALUES ('duplicate', 'dictado duplicado', NULL, NULL);",
            )
            .unwrap();
        drop(connection);

        let bundle = parse(temp.path()).unwrap();

        assert_eq!(bundle.dictionary, [" ECG ", "metoprolol"]);
        assert_eq!(bundle.replacements.len(), 2);
        assert_eq!(bundle.replacements[0].from, "qhs");
        assert_eq!(bundle.replacements[0].to, "cada noche");
        assert_eq!(bundle.personalities.len(), 1);
        assert_eq!(bundle.personalities[0].name, "Nota clínica");
        assert_eq!(bundle.personalities[0].apps[0].name, "Notes");
        assert_eq!(bundle.language.as_deref(), Some("es-CO"));
        assert_eq!(
            bundle
                .model_hint
                .as_ref()
                .map(|hint| hint.source_id.as_str()),
            Some("parakeet-tdt-0.6b")
        );
        assert_eq!(bundle.transcript_count, 2);
        assert_eq!(bundle.transcripts[0].text, "dictado duplicado");
        assert_eq!(bundle.transcripts[1].text, "desde base");
    }

    #[test]
    fn preferred_but_invalid_replacement_fields_block_aliases() {
        let invalid_source = json!({"from": null, "original": "fallback"});
        let invalid_target = json!({
            "from": "qhs",
            "to": 5,
            "replacement": "would not be used"
        });

        assert!(replacement(&invalid_source).is_none());
        assert_eq!(replacement(&invalid_target).unwrap().to, "");
    }

    #[test]
    fn empty_preferred_recording_text_blocks_lower_priority_text() {
        let root = json!({"result": "  ", "text": "would not be used"});

        assert!(RecordingMetadata { root: &root }.transcription().is_none());
    }

    #[test]
    fn mode_metadata_is_ignored_when_the_mode_has_no_personality_content() {
        let root = json!({
            "name": "Empty mode",
            "language": "es",
            "voiceModelID": "whisper-small"
        });
        let mut bundle = ImportBundle::default();

        ModeDocument { root: &root }.contribute_to(&mut bundle);

        assert!(bundle.personalities.is_empty());
        assert!(bundle.language.is_none());
        assert!(bundle.model_hint.is_none());
    }
}
