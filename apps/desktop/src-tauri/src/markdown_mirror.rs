use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use uuid::Uuid;

use crate::library::{
    build_export_content, build_meeting_export_content, ExportFormat, LibraryItem, MeetingDetails,
};
use crate::settings::UserSettings;
use crate::storage::{StorageManager, TranscriptionRecord};

const DICTATIONS_DIR: &str = "dictations";
const LIBRARY_DIR: &str = "library";
const MEETINGS_DIR: &str = "meetings";

pub(crate) fn mirror_dictation(
    settings: &UserSettings,
    record: &TranscriptionRecord,
) -> Result<Option<PathBuf>> {
    let Some(root) = configured_root(settings) else {
        return Ok(None);
    };
    let body = render_dictation(record);
    write_entry(root, DICTATIONS_DIR, &record.id, &body).map(Some)
}

pub(crate) fn mirror_library_item(
    settings: &UserSettings,
    item: &LibraryItem,
    meeting: Option<&MeetingDetails>,
) -> Result<Option<PathBuf>> {
    let Some(root) = configured_root(settings) else {
        return Ok(None);
    };
    let body = render_library_item(item, meeting)?;
    let directory = if item.kind == "meeting" {
        MEETINGS_DIR
    } else {
        LIBRARY_DIR
    };
    write_entry(root, directory, &item.id, &body).map(Some)
}

pub(crate) fn mirror_library_by_id(
    settings: &UserSettings,
    storage: &StorageManager,
    id: &str,
) -> Result<Option<PathBuf>> {
    if configured_root(settings).is_none() {
        return Ok(None);
    }
    let Some(item) = storage.get_library_item(id)? else {
        return Ok(None);
    };
    // Una nota también tiene notas y resumen que espejar; lo que no cambia es
    // dónde se escribe el fichero, para no mudar lo ya espejado.
    let meeting = if item.is_capture() {
        storage.get_meeting_details(id)?
    } else {
        None
    };
    mirror_library_item(settings, &item, meeting.as_ref())
}

/// Writes a user-confirmed Companion export into the existing Markdown mirror.
/// The output id is stable, so delivery retries replace the same file instead
/// of creating duplicate notes in an Obsidian vault.
pub(crate) fn mirror_confirmed_meeting_output(
    settings: &UserSettings,
    output_id: &str,
    meeting_id: &str,
    content: &str,
) -> Result<Option<PathBuf>> {
    let Some(root) = configured_root(settings) else {
        return Ok(None);
    };
    let output_id = output_id.trim();
    if output_id.is_empty() {
        anyhow::bail!("Meeting output id is required");
    }
    let body = format!(
        "---\ntype: meeting_output\nlooper_id: {}\nmeeting_id: {}\n---\n\n{}\n",
        yaml_string(output_id),
        yaml_string(meeting_id.trim()),
        content.trim(),
    );
    write_entry(root, MEETINGS_DIR, &format!("output-{output_id}"), &body).map(Some)
}

fn configured_root(settings: &UserSettings) -> Option<&Path> {
    if !settings.markdown_mirror_enabled {
        return None;
    }
    let path = settings.markdown_mirror_path.trim();
    (!path.is_empty()).then(|| Path::new(path))
}

fn render_dictation(record: &TranscriptionRecord) -> String {
    let raw = record.raw_text.as_deref().unwrap_or(&record.text);
    format!(
        "---\ntype: dictation\nlooper_id: {}\ncreated_at: {}\napp_id: {}\nworkflow_id: {}\nworkflow: {}\nllm_cleaned: {}\n---\n\n# Dictation\n\n## Final\n\n{}\n\n## Raw\n\n{}\n",
        yaml_string(&record.id),
        yaml_string(&record.timestamp.to_rfc3339()),
        yaml_optional(record.app_id.as_deref()),
        yaml_optional(record.mode_id.as_deref()),
        yaml_optional(record.mode_name.as_deref()),
        record.llm_cleaned,
        record.text.trim(),
        raw.trim(),
    )
}

fn render_library_item(item: &LibraryItem, meeting: Option<&MeetingDetails>) -> Result<String> {
    let content = match meeting {
        Some(details) => build_meeting_export_content(item, details, ExportFormat::Md)?,
        None => build_export_content(item, ExportFormat::Md)?,
    };
    let entry_type = if item.kind == "meeting" {
        "meeting"
    } else {
        "library"
    };
    Ok(format!(
        "---\ntype: {entry_type}\nlooper_id: {}\ncreated_at: {}\ntranscribed_at: {}\nsource_format: {}\ntags: {}\n---\n\n{}\n",
        yaml_string(&item.id),
        yaml_string(&item.created_at),
        yaml_optional(item.transcribed_at.as_deref()),
        yaml_string(&item.original_format),
        serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string()),
        content.trim(),
    ))
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn yaml_optional(value: Option<&str>) -> String {
    value.map(yaml_string).unwrap_or_else(|| "null".to_string())
}

fn write_entry(root: &Path, directory: &str, id: &str, content: &str) -> Result<PathBuf> {
    let directory = root.join(directory);
    fs::create_dir_all(&directory).with_context(|| {
        format!(
            "Failed to create Markdown mirror at {}",
            directory.display()
        )
    })?;
    let target = directory.join(format!("{}.md", safe_filename(id)));
    atomic_write(&target, content.as_bytes())?;
    Ok(target)
}

fn safe_filename(id: &str) -> String {
    use std::fmt::Write as _;

    let mut safe = String::with_capacity(id.len());
    for byte in id.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' => safe.push(byte as char),
            _ => {
                let _ = write!(safe, "%{byte:02X}");
            }
        }
    }
    if safe.is_empty() {
        "entry".to_string()
    } else {
        safe
    }
}

fn atomic_write(target: &Path, content: &[u8]) -> Result<()> {
    let file_name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("entry.md");
    let temporary = target.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .with_context(|| format!("Failed to create {}", temporary.display()))?;
        file.write_all(content)?;
        file.sync_all()?;
        replace_file(&temporary, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn replace_file(temporary: &Path, target: &Path) -> Result<()> {
    fs::rename(temporary, target).with_context(|| format!("Failed to replace {}", target.display()))
}

#[cfg(target_os = "windows")]
fn replace_file(temporary: &Path, target: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temporary: Vec<u16> = temporary
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let target: Vec<u16> = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        MoveFileExW(
            PCWSTR(temporary.as_ptr()),
            PCWSTR(target.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .with_context(|| "Failed to atomically replace Markdown mirror file")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::Local;
    use tempfile::tempdir;

    use super::*;
    use crate::library::LibraryItemStatus;
    use crate::storage::TranscriptionStatus;

    fn settings(root: &Path) -> UserSettings {
        UserSettings {
            markdown_mirror_enabled: true,
            markdown_mirror_path: root.to_string_lossy().to_string(),
            ..UserSettings::default()
        }
    }

    fn dictation(text: &str) -> TranscriptionRecord {
        TranscriptionRecord {
            id: "dictation-1".to_string(),
            timestamp: Local::now(),
            text: text.to_string(),
            raw_text: Some("raw words".to_string()),
            audio_path: String::new(),
            audio_available: false,
            status: TranscriptionStatus::Success,
            error_message: None,
            llm_cleaned: true,
            speech_model: "parakeet".to_string(),
            llm_model: None,
            word_count: 2,
            audio_duration_seconds: 1.0,
            synced: false,
            mode_id: Some("email".to_string()),
            mode_name: Some("Email".to_string()),
            app_id: Some("com.apple.mail".to_string()),
        }
    }

    #[test]
    fn dictation_updates_the_same_stable_file_with_raw_and_final_text() {
        let root = tempdir().unwrap();
        let settings = settings(root.path());
        let path = mirror_dictation(&settings, &dictation("Final text"))
            .unwrap()
            .unwrap();
        assert_eq!(path, root.path().join("dictations/dictation-1.md"));
        let first = fs::read_to_string(&path).unwrap();
        assert!(first.contains("## Final\n\nFinal text"));
        assert!(first.contains("## Raw\n\nraw words"));

        mirror_dictation(&settings, &dictation("Updated final"))
            .unwrap()
            .unwrap();
        let updated = fs::read_to_string(path).unwrap();
        assert!(updated.contains("Updated final"));
        assert!(!updated.contains("Final text"));
    }

    #[test]
    fn library_entry_has_frontmatter_and_is_not_removed_when_mirroring_is_disabled() {
        let root = tempdir().unwrap();
        let settings = settings(root.path());
        let item = LibraryItem {
            id: "library/1".to_string(),
            name: "Pricing call".to_string(),
            audio_path: String::new(),
            source_path: String::new(),
            store_original: false,
            status: LibraryItemStatus::Complete,
            transcript: Some("We discussed pricing.".to_string()),
            segments: None,
            words: None,
            duration_seconds: 60.0,
            file_size_bytes: 0,
            original_format: "wav".to_string(),
            created_at: "2026-07-19T10:00:00Z".to_string(),
            transcribed_at: Some("2026-07-19T10:01:00Z".to_string()),
            tags: vec!["pricing".to_string()],
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "parakeet".to_string(),
            show_timestamps: false,
            detect_speakers: false,
            kind: "import".to_string(),
            speakers: None,
        };
        let path = mirror_library_item(&settings, &item, None)
            .unwrap()
            .unwrap();
        assert_eq!(path, root.path().join("library/library%2F1.md"));
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("looper_id: \"library/1\""));
        assert!(content.contains("We discussed pricing."));

        let disabled = UserSettings::default();
        assert!(mirror_library_item(&disabled, &item, None)
            .unwrap()
            .is_none());
        assert!(path.exists());
    }

    #[test]
    fn filename_encoding_prevents_sanitization_collisions() {
        assert_ne!(safe_filename("library/1"), safe_filename("library_1"));
        assert_eq!(safe_filename("../entry"), "%2E%2E%2Fentry");
    }

    #[test]
    fn confirmed_meeting_output_retries_replace_the_same_markdown_file() {
        let root = tempdir().unwrap();
        let settings = settings(root.path());
        let path =
            mirror_confirmed_meeting_output(&settings, "output/1", "meeting-1", "# First export")
                .unwrap()
                .unwrap();
        assert_eq!(path, root.path().join("meetings/output-output%2F1.md"));
        assert!(fs::read_to_string(&path)
            .unwrap()
            .contains("# First export"));

        mirror_confirmed_meeting_output(&settings, "output/1", "meeting-1", "# Updated export")
            .unwrap()
            .unwrap();
        let content = fs::read_to_string(path).unwrap();
        assert!(content.contains("meeting_id: \"meeting-1\""));
        assert!(content.contains("# Updated export"));
        assert!(!content.contains("# First export"));
    }
}
