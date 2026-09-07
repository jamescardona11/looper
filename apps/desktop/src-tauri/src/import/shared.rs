use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::{NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

use crate::settings::{Personality, Replacement};
use crate::storage::ImportedTranscription;

pub fn app_support_dir(home: &Path, app_folder: &str) -> PathBuf {
    platform_support_root(home).join(app_folder)
}

#[cfg(target_os = "macos")]
fn platform_support_root(home: &Path) -> PathBuf {
    home.join("Library").join("Application Support")
}

#[cfg(target_os = "windows")]
fn platform_support_root(home: &Path) -> PathBuf {
    let user_profile = std::env::var_os("USERPROFILE").map(PathBuf::from);
    if user_profile.as_deref() == Some(home) {
        return std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData").join("Roaming"));
    }

    home.join("AppData").join("Roaming")
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_support_root(home: &Path) -> PathBuf {
    home.join(".config")
}

pub fn translate_accelerator(raw: &str) -> Option<String> {
    let translated: Vec<String> = raw
        .split('+')
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(accelerator_token)
        .collect();

    (!translated.is_empty()).then(|| translated.join("+"))
}

fn accelerator_token(token: &str) -> String {
    let lowercase = token.to_lowercase();
    if let Some(modifier) = modifier_alias(&lowercase) {
        return modifier.to_string();
    }

    let key = ["key", "digit", "numpad"]
        .into_iter()
        .find_map(|prefix| lowercase.strip_prefix(prefix))
        .unwrap_or(&lowercase);
    if matches!(key, "fn" | "function") {
        "Fn".to_string()
    } else {
        uppercase_initial(key)
    }
}

fn modifier_alias(token: &str) -> Option<&'static str> {
    match token {
        "meta" | "cmd" | "command" | "super" | "win" => Some("Super"),
        "control" | "ctrl" => Some("Control"),
        "alt" | "option" | "altgr" => Some("Alt"),
        "shift" => Some("Shift"),
        "cmdleft" | "commandleft" | "metaleft" | "superleft" | "winleft" | "windowsleft" => {
            Some("CmdLeft")
        }
        "cmdright" | "commandright" | "metaright" | "superright" | "winright" | "windowsright" => {
            Some("CmdRight")
        }
        "controlleft" | "ctrlleft" => Some("CtrlLeft"),
        "controlright" | "ctrlright" => Some("CtrlRight"),
        "altleft" | "optionleft" => Some("OptLeft"),
        "altright" | "optionright" => Some("OptRight"),
        "shiftleft" => Some("ShiftLeft"),
        "shiftright" => Some("ShiftRight"),
        _ => None,
    }
}

fn uppercase_initial(value: &str) -> String {
    let mut characters = value.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };
    first.to_uppercase().chain(characters).collect::<String>()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBundle {
    pub dictionary: Vec<String>,
    pub replacements: Vec<Replacement>,
    pub personalities: Vec<Personality>,
    pub smart_shortcut: Option<String>,
    pub language: Option<String>,
    pub auto_launch: Option<bool>,
    pub model_hint: Option<ModelHint>,
    pub transcripts: Vec<ImportedTranscription>,
    pub transcript_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHint {
    pub source_id: String,
    pub family: Option<ModelFamily>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelFamily {
    WhisperLarge,
    WhisperMedium,
    WhisperSmall,
    WhisperBase,
    WhisperTiny,
    Parakeet,
}

pub fn map_model_family(source_id: &str) -> Option<ModelFamily> {
    let source = source_id.to_lowercase();
    if source.contains("parakeet") {
        return Some(ModelFamily::Parakeet);
    }
    if !["whisper", "large", "turbo"]
        .iter()
        .any(|marker| source.contains(marker))
    {
        return None;
    }

    let family = if ["large", "turbo", "v3"]
        .iter()
        .any(|marker| source.contains(marker))
    {
        ModelFamily::WhisperLarge
    } else if source.contains("medium") {
        ModelFamily::WhisperMedium
    } else if source.contains("small") {
        ModelFamily::WhisperSmall
    } else if source.contains("base") {
        ModelFamily::WhisperBase
    } else if source.contains("tiny") {
        ModelFamily::WhisperTiny
    } else {
        ModelFamily::WhisperLarge
    };
    Some(family)
}

pub fn resolve_looper_model(family: ModelFamily, available_keys: &[String]) -> Option<String> {
    let preferences: &[&str] = match family {
        ModelFamily::Parakeet => &["parakeet"],
        ModelFamily::WhisperLarge => &["large", "turbo"],
        ModelFamily::WhisperMedium => &["medium", "large"],
        ModelFamily::WhisperSmall => &["small", "base"],
        ModelFamily::WhisperBase => &["base", "small"],
        ModelFamily::WhisperTiny => &["tiny", "small"],
    };

    preferences
        .iter()
        .find_map(|needle| first_model_containing(available_keys, needle))
        .or_else(|| {
            (family != ModelFamily::Parakeet)
                .then(|| first_model_containing(available_keys, "whisper"))
                .flatten()
        })
}

fn first_model_containing(available_keys: &[String], needle: &str) -> Option<String> {
    available_keys
        .iter()
        .find(|key| key.to_lowercase().contains(needle))
        .cloned()
}

pub fn parse_datetime_millis(raw: &str) -> Option<i64> {
    let input = raw.trim();
    if input.is_empty() {
        return None;
    }

    parse_timestamp_with_zone(input)
        .or_else(|| parse_timestamp_as_utc(input))
        .or_else(|| parse_epoch(input))
}

fn parse_timestamp_with_zone(input: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(input)
        .ok()
        .map(|date| date.timestamp_millis())
        .or_else(|| {
            [
                "%Y-%m-%d %H:%M:%S%.f %:z",
                "%Y-%m-%dT%H:%M:%S%.f%:z",
                "%Y-%m-%dT%H:%M:%S%.fZ",
            ]
            .into_iter()
            .find_map(|format| chrono::DateTime::parse_from_str(input, format).ok())
            .map(|date| date.timestamp_millis())
        })
}

fn parse_timestamp_as_utc(input: &str) -> Option<i64> {
    [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    .into_iter()
    .find_map(|format| NaiveDateTime::parse_from_str(input, format).ok())
    .map(|date| Utc.from_utc_datetime(&date).timestamp_millis())
}

fn parse_epoch(input: &str) -> Option<i64> {
    input.parse::<i64>().ok().map(|value| {
        if value < 100_000_000_000 {
            value * 1000
        } else {
            value
        }
    })
}

pub fn read_json(path: &Path) -> Option<serde_json::Value> {
    let document = std::fs::read(path).ok()?;
    serde_json::from_slice(&document).ok()
}

fn sidecar_path(database: &Path, suffix: &str) -> PathBuf {
    let mut path = database.as_os_str().to_os_string();
    path.push(suffix);
    PathBuf::from(path)
}

pub fn open_sqlite_readonly(path: &Path) -> Result<(rusqlite::Connection, TempDbGuard), String> {
    if !path.exists() {
        return Err(format!("database not found: {}", path.display()));
    }

    let snapshot =
        std::env::temp_dir().join(format!("looper-import-{}.sqlite", uuid::Uuid::new_v4()));
    std::fs::copy(path, &snapshot).map_err(|error| format!("failed to copy database: {error}"))?;
    let guard = TempDbGuard(snapshot.clone());
    copy_existing_sidecars(path, &snapshot);

    let connection = rusqlite::Connection::open_with_flags(
        &snapshot,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("failed to open database: {error}"))?;
    Ok((connection, guard))
}

fn copy_existing_sidecars(source: &Path, snapshot: &Path) {
    for suffix in ["-wal", "-shm"] {
        let source_sidecar = sidecar_path(source, suffix);
        if source_sidecar.exists() {
            let _ = std::fs::copy(source_sidecar, sidecar_path(snapshot, suffix));
        }
    }
}

pub struct TempDbGuard(PathBuf);

impl Drop for TempDbGuard {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let target = if suffix.is_empty() {
                self.0.clone()
            } else {
                sidecar_path(&self.0, suffix)
            };
            let _ = std::fs::remove_file(target);
        }
    }
}

pub fn sqlite_table_exists(connection: &rusqlite::Connection, table: &str) -> bool {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
            [table],
            |_| Ok(()),
        )
        .is_ok()
}

pub fn normalize_language(raw: &str) -> Option<String> {
    let input = raw.trim();
    if input.is_empty() || input.eq_ignore_ascii_case("auto") {
        return None;
    }

    let language_key = input
        .split(['-', '_'])
        .next()
        .unwrap_or(input)
        .to_lowercase();
    let languages = crate::model_language_table::whisper_supported_languages();

    languages
        .iter()
        .find(|language| language.code == language_key)
        .or_else(|| {
            languages
                .iter()
                .find(|language| language.name.eq_ignore_ascii_case(input))
        })
        .map(|language| language.code.clone())
}

pub fn dedup_transcripts(transcripts: &mut Vec<ImportedTranscription>) {
    let mut identities = HashSet::new();
    transcripts.retain(|item| identities.insert((item.text.clone(), item.timestamp_ms)));
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn accelerator_translation_preserves_aliases_sides_and_key_prefixes() {
        let cases = [
            ("command+shift+space", Some("Super+Shift+Space")),
            ("ctrl+alt+keyk", Some("Control+Alt+K")),
            ("function+digit1", Some("Fn+1")),
            ("windowsleft+numpad7", Some("CmdLeft+7")),
            (" + ", None),
        ];
        for (input, expected) in cases {
            assert_eq!(translate_accelerator(input).as_deref(), expected);
        }
    }

    #[test]
    fn source_models_map_to_families_with_original_priority() {
        assert_eq!(
            map_model_family("parakeet-tdt-0.6b"),
            Some(ModelFamily::Parakeet)
        );
        assert_eq!(
            map_model_family("whisper-medium-v3"),
            Some(ModelFamily::WhisperLarge)
        );
        assert_eq!(
            map_model_family("Whisper Medium.en"),
            Some(ModelFamily::WhisperMedium)
        );
        assert_eq!(map_model_family("unknown-model"), None);
    }

    #[test]
    fn model_resolution_uses_family_preferences_then_whisper_fallback() {
        let keys = vec![
            "whisper-base".to_string(),
            "whisper-small".to_string(),
            "parakeet-tdt".to_string(),
        ];
        assert_eq!(
            resolve_looper_model(ModelFamily::Parakeet, &keys).as_deref(),
            Some("parakeet-tdt")
        );
        assert_eq!(
            resolve_looper_model(ModelFamily::WhisperTiny, &keys).as_deref(),
            Some("whisper-small")
        );
        assert_eq!(
            resolve_looper_model(ModelFamily::WhisperLarge, &keys).as_deref(),
            Some("whisper-base")
        );
        assert_eq!(
            resolve_looper_model(ModelFamily::Parakeet, &["whisper-base".to_string()]),
            None
        );
    }

    #[test]
    fn timestamps_accept_zoned_naive_and_epoch_forms() {
        for input in [
            "2026-07-08T12:34:56Z",
            "2026-07-08 12:34:56",
            "1783514096",
            "1783514096000",
        ] {
            assert_eq!(parse_datetime_millis(input), Some(1_783_514_096_000));
        }
        assert_eq!(parse_datetime_millis("not a date"), None);
        assert_eq!(parse_datetime_millis("  "), None);
    }

    #[test]
    fn languages_accept_codes_and_full_names_but_not_auto() {
        assert_eq!(normalize_language("en-US").as_deref(), Some("en"));
        assert_eq!(normalize_language("Spanish").as_deref(), Some("es"));
        assert_eq!(normalize_language("AUTO"), None);
        assert_eq!(normalize_language(""), None);
    }

    #[test]
    fn transcript_deduplication_keeps_first_occurrence_and_order() {
        let mut items = vec![
            ImportedTranscription {
                text: "same".to_string(),
                timestamp_ms: 10,
            },
            ImportedTranscription {
                text: "other".to_string(),
                timestamp_ms: 20,
            },
            ImportedTranscription {
                text: "same".to_string(),
                timestamp_ms: 10,
            },
        ];
        dedup_transcripts(&mut items);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].text, "same");
        assert_eq!(items[1].text, "other");
    }

    #[test]
    fn sqlite_snapshot_is_queryable_and_deleted_with_guard() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.sqlite");
        let source_connection = rusqlite::Connection::open(&source).unwrap();
        source_connection
            .execute("CREATE TABLE history (value TEXT)", [])
            .unwrap();
        source_connection
            .execute("INSERT INTO history VALUES ('preserved')", [])
            .unwrap();
        drop(source_connection);

        let (snapshot, guard) = open_sqlite_readonly(&source).unwrap();
        let snapshot_path = guard.0.clone();
        assert!(sqlite_table_exists(&snapshot, "history"));
        let value: String = snapshot
            .query_row("SELECT value FROM history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
        drop(snapshot);
        drop(guard);

        assert!(source.exists());
        assert!(!snapshot_path.exists());
    }

    #[test]
    fn import_bundle_keeps_camel_case_wire_and_family_tag() {
        let bundle = ImportBundle {
            smart_shortcut: Some("Super+Space".to_string()),
            model_hint: Some(ModelHint {
                source_id: "whisper-large-v3".to_string(),
                family: Some(ModelFamily::WhisperLarge),
            }),
            transcript_count: 4,
            ..Default::default()
        };
        let value = serde_json::to_value(bundle).unwrap();
        assert_eq!(value["smartShortcut"], "Super+Space");
        assert_eq!(value["modelHint"]["family"], "whisper_large");
        assert_eq!(value["transcriptCount"], 4);
        assert_eq!(value["autoLaunch"], json!(null));
    }
}
