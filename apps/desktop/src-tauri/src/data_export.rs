//! Complete, portable user-data export.
//!
//! Archive metadata never contains machine-local paths. Audio is copied into
//! the ZIP only when it still exists; transcripts remain exportable without it.

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::library::{LibraryFilter, LibraryItem, LibraryTranslation};
use crate::storage::{StorageManager, TranscriptionRecord};

const PAGE_SIZE: usize = 500;

#[derive(Debug, Serialize)]
pub struct CompleteExportReport {
    pub output_path: String,
    pub dictations: usize,
    pub dictation_audio_files: usize,
    pub library_items: usize,
    pub library_media_files: usize,
    pub meetings: usize,
    pub translations: usize,
    pub bytes: u64,
}

#[derive(Serialize)]
struct ExportManifest {
    format: &'static str,
    format_version: u32,
    exported_at: String,
    dictations: usize,
    library_items: usize,
    note: &'static str,
}

pub fn export_complete_archive(
    storage: &StorageManager,
    output_path: &Path,
) -> Result<CompleteExportReport> {
    if output_path.as_os_str().is_empty() {
        anyhow::bail!("Export path cannot be empty");
    }
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }

    let dictations = storage.get_all()?;
    let library_items = all_library_items(storage)?;
    let temp_path = temporary_export_path(output_path);
    let mut report = match write_archive(storage, &temp_path, &dictations, &library_items) {
        Ok(report) => report,
        Err(error) => {
            let _ = std::fs::remove_file(&temp_path);
            return Err(error);
        }
    };
    replace_export(&temp_path, output_path)?;
    report.output_path = output_path.display().to_string();
    report.bytes = std::fs::metadata(output_path)?.len();
    Ok(report)
}

fn write_archive(
    storage: &StorageManager,
    output_path: &Path,
    dictations: &[TranscriptionRecord],
    library_items: &[LibraryItem],
) -> Result<CompleteExportReport> {
    let file = File::create(output_path)
        .with_context(|| format!("Failed to create {}", output_path.display()))?;
    let mut zip = ZipWriter::new(file);
    let mut dictation_audio_files = 0;
    let mut library_media_files = 0;
    let mut meeting_count = 0;
    let mut translation_count = 0;

    let mut portable_dictations = Vec::with_capacity(dictations.len());
    for record in dictations {
        let mut portable = record.clone();
        portable.audio_path.clear();
        portable.audio_available = false;
        let id = safe_component(&record.id);
        write_text(
            &mut zip,
            &format!("history/transcripts/{id}.txt"),
            &record.text,
        )?;
        let audio_path = Path::new(&record.audio_path);
        if record.audio_available && audio_path.is_file() {
            let extension = safe_extension(audio_path).unwrap_or("wav");
            let archive_path = format!("history/audio/{id}.{extension}");
            write_file(&mut zip, &archive_path, audio_path)?;
            portable.audio_path = archive_path;
            portable.audio_available = true;
            dictation_audio_files += 1;
        }
        portable_dictations.push(portable);
    }
    write_json(&mut zip, "history/history.json", &portable_dictations)?;

    let mut portable_library = Vec::with_capacity(library_items.len());
    let mut translations = Vec::<LibraryTranslation>::new();
    for item in library_items {
        let id = safe_component(&item.id);
        let mut portable = item.clone();
        portable.source_path = portable_source(&item.source_path);
        portable.audio_path.clear();
        if let Some(transcript) = item.transcript.as_deref() {
            write_text(
                &mut zip,
                &format!("library/{id}/transcript.txt"),
                transcript,
            )?;
        }

        let audio_path = Path::new(&item.audio_path);
        if audio_path.is_file() {
            let extension = safe_extension(audio_path).unwrap_or("wav");
            let archive_path = format!("library/{id}/audio.{extension}");
            write_file(&mut zip, &archive_path, audio_path)?;
            portable.audio_path = archive_path;
            library_media_files += 1;
        }
        if item.store_original {
            if let Some(parent) = audio_path.parent() {
                for source in managed_originals(parent)? {
                    let name = source
                        .file_name()
                        .and_then(|value| value.to_str())
                        .map(safe_component)
                        .unwrap_or_else(|| "source".to_string());
                    write_file(&mut zip, &format!("library/{id}/original/{name}"), &source)?;
                    library_media_files += 1;
                }
            }
        }

        if item.kind == "meeting" {
            if let Some(details) = storage.get_meeting_details(&item.id)? {
                write_json(&mut zip, &format!("library/{id}/meeting.json"), &details)?;
                meeting_count += 1;
            }
        }

        let item_translations = storage.get_library_translations(&item.id)?;
        translation_count += item_translations.len();
        translations.extend(item_translations);
        portable_library.push(portable);
    }
    write_json(&mut zip, "library/items.json", &portable_library)?;
    write_json(&mut zip, "library/translations.json", &translations)?;

    write_json(
        &mut zip,
        "manifest.json",
        &ExportManifest {
            format: "looper-complete-export",
            format_version: 1,
            exported_at: Utc::now().to_rfc3339(),
            dictations: dictations.len(),
            library_items: library_items.len(),
            note: "Machine-local source paths and credentials are intentionally excluded.",
        },
    )?;
    zip.finish()?;

    Ok(CompleteExportReport {
        output_path: output_path.display().to_string(),
        dictations: dictations.len(),
        dictation_audio_files,
        library_items: library_items.len(),
        library_media_files,
        meetings: meeting_count,
        translations: translation_count,
        bytes: 0,
    })
}

fn all_library_items(storage: &StorageManager) -> Result<Vec<LibraryItem>> {
    let mut items = Vec::new();
    loop {
        let offset = items.len();
        let (page, has_more) =
            storage.get_library_items_page(LibraryFilter::default(), PAGE_SIZE, offset)?;
        items.extend(page);
        if !has_more {
            return Ok(items);
        }
    }
}

fn text_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)
}

fn media_options() -> SimpleFileOptions {
    SimpleFileOptions::default().compression_method(CompressionMethod::Stored)
}

fn write_json<T: Serialize>(zip: &mut ZipWriter<File>, path: &str, value: &T) -> Result<()> {
    zip.start_file(path, text_options())?;
    serde_json::to_writer_pretty(zip, value)?;
    Ok(())
}

fn write_text(zip: &mut ZipWriter<File>, path: &str, value: &str) -> Result<()> {
    zip.start_file(path, text_options())?;
    zip.write_all(value.as_bytes())?;
    Ok(())
}

fn write_file(zip: &mut ZipWriter<File>, archive_path: &str, source: &Path) -> Result<()> {
    zip.start_file(archive_path, media_options())?;
    let mut file = File::open(source)
        .with_context(|| format!("Failed to read export file {}", source.display()))?;
    std::io::copy(&mut file, zip)?;
    Ok(())
}

fn managed_originals(directory: &Path) -> Result<Vec<PathBuf>> {
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut originals = Vec::new();
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let is_source = path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with("source."));
        if is_source && path.is_file() {
            originals.push(path);
        }
    }
    originals.sort();
    Ok(originals)
}

fn portable_source(source: &str) -> String {
    if source.starts_with("https://") {
        source.to_string()
    } else {
        String::new()
    }
}

fn safe_component(raw: &str) -> String {
    let safe: String = raw
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .take(160)
        .collect();
    if safe.is_empty() || safe == "." || safe == ".." {
        "item".to_string()
    } else {
        safe
    }
}

fn safe_extension(path: &Path) -> Option<&str> {
    path.extension()
        .and_then(|value| value.to_str())
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 10
                && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
        })
}

fn temporary_export_path(output: &Path) -> PathBuf {
    let file_name = output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("looper-export.zip");
    output.with_file_name(format!(".{file_name}.partial-{}", uuid::Uuid::new_v4()))
}

fn replace_export(temp: &Path, output: &Path) -> Result<()> {
    if !output.exists() {
        return std::fs::rename(temp, output)
            .with_context(|| format!("Failed to finish export at {}", output.display()));
    }

    let backup = temporary_export_path(output).with_extension("previous");
    std::fs::rename(output, &backup)
        .with_context(|| format!("Failed to prepare replacement for {}", output.display()))?;
    if let Err(error) = std::fs::rename(temp, output) {
        let restore_error = std::fs::rename(&backup, output).err();
        return match restore_error {
            Some(restore_error) => Err(anyhow::anyhow!(
                "Failed to finish export at {}: {error}; the prior export remains at {} because it could not be restored: {restore_error}",
                output.display(),
                backup.display()
            )),
            None => Err(error)
                .with_context(|| format!("Failed to finish export at {}", output.display())),
        };
    }
    let _ = std::fs::remove_file(backup);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{LibraryItem, LibraryItemStatus, MeetingDetails, MeetingSummaryStatus};
    use crate::storage::{TranscriptionMetadata, TranscriptionStatus};
    use std::io::Read;

    #[test]
    fn archive_contains_portable_history_and_audio_without_local_paths() {
        let directory = tempfile::tempdir().unwrap();
        let audio = directory.path().join("private-recording.wav");
        std::fs::write(&audio, b"fake wave bytes").unwrap();
        let storage = StorageManager::new(directory.path().join("transcriptions.db")).unwrap();
        storage
            .save_transcription(
                "A portable transcript".to_string(),
                audio.display().to_string(),
                TranscriptionStatus::Success,
                None,
                TranscriptionMetadata::default(),
                Some("dictation-1".to_string()),
                None,
            )
            .unwrap();

        let output = directory.path().join("complete.zip");
        let report = export_complete_archive(&storage, &output).unwrap();
        assert_eq!(report.dictations, 1);
        assert_eq!(report.dictation_audio_files, 1);

        let file = File::open(output).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive.by_name("manifest.json").is_ok());
        assert!(archive.by_name("history/audio/dictation-1.wav").is_ok());
        let mut history = String::new();
        archive
            .by_name("history/history.json")
            .unwrap()
            .read_to_string(&mut history)
            .unwrap();
        assert!(history.contains("history/audio/dictation-1.wav"));
        assert!(!history.contains(directory.path().to_string_lossy().as_ref()));
    }

    #[test]
    fn replacement_keeps_the_previous_export_when_the_new_file_is_missing() {
        let directory = tempfile::tempdir().unwrap();
        let output = directory.path().join("complete.zip");
        std::fs::write(&output, b"prior export").unwrap();

        let error = replace_export(&directory.path().join("missing.partial"), &output).unwrap_err();

        assert!(error.to_string().contains("Failed to finish export"));
        assert_eq!(std::fs::read(output).unwrap(), b"prior export");
    }

    #[test]
    fn archive_contains_meeting_notes_and_summary() {
        let directory = tempfile::tempdir().unwrap();
        let storage = StorageManager::new(directory.path().join("transcriptions.db")).unwrap();
        let id = "meeting-1".to_string();
        let audio = directory.path().join("meeting.wav");
        std::fs::write(&audio, b"fake meeting audio").unwrap();
        let item = LibraryItem {
            id: id.clone(),
            name: "Planning".to_string(),
            audio_path: audio.display().to_string(),
            source_path: String::new(),
            store_original: false,
            status: LibraryItemStatus::Complete,
            transcript: Some("We chose the launch date.".to_string()),
            segments: None,
            words: None,
            duration_seconds: 60.0,
            file_size_bytes: 18,
            original_format: "wav".to_string(),
            created_at: "2026-07-18T12:00:00Z".to_string(),
            transcribed_at: Some("2026-07-18T12:01:00Z".to_string()),
            tags: vec![],
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            speech_model: "test-model".to_string(),
            show_timestamps: true,
            detect_speakers: false,
            kind: "meeting".to_string(),
            speakers: None,
        };
        let details = MeetingDetails {
            library_item_id: id,
            started_at: "2026-07-18T12:00:00Z".to_string(),
            ended_at: Some("2026-07-18T12:01:00Z".to_string()),
            notes: "Confirm the launch checklist.".to_string(),
            notes_revision: 1,
            summary: Some("## Decision\nLaunch on Friday.".to_string()),
            summary_status: MeetingSummaryStatus::Complete,
            summary_error: None,
            system_audio_enabled: true,
            recovered: false,
            calendar_context: None,
            note_markers: Vec::new(),
            live_transcript: Vec::new(),
        };
        storage.insert_meeting_item(item, &details).unwrap();

        let output = directory.path().join("complete.zip");
        let report = export_complete_archive(&storage, &output).unwrap();
        assert_eq!(report.meetings, 1);

        let file = File::open(output).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut meeting = String::new();
        archive
            .by_name("library/meeting-1/meeting.json")
            .unwrap()
            .read_to_string(&mut meeting)
            .unwrap();
        assert!(meeting.contains("Confirm the launch checklist."));
        assert!(meeting.contains("Launch on Friday."));
        assert!(!meeting.contains(directory.path().to_string_lossy().as_ref()));
    }
}
