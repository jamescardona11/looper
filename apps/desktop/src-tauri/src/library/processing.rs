#[path = "processing_audio.rs"]
mod processing_audio;
#[path = "processing_export.rs"]
mod processing_export;
#[path = "processing_tools.rs"]
mod processing_tools;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{model_manager, storage::StorageManager, AppRuntime, AppState};

use super::types::{
    cancelled_error, LibraryImportOptions, LibraryImportProgressPayload, LibraryItem,
    LibraryItemPatch, LibraryItemStatus, EVENT_LIBRARY_IMPORT_PROGRESS, SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
};

pub(crate) use processing_audio::{convert_to_wav, read_wav_info, stream_wav_chunks, WavInfo};
pub(crate) use processing_export::{
    build_export_content, build_meeting_export_content, convert_segments_to_ms, diarize_segments,
};
pub(crate) use processing_tools::{find_binary_in_path, probe_media_duration_ms};

pub(crate) fn find_ffmpeg_in_path() -> Option<PathBuf> {
    processing_tools::find_ffmpeg_in_path()
}

pub(crate) fn create_item_from_path(
    app: &AppHandle<AppRuntime>,
    storage: Arc<StorageManager>,
    source_path: &Path,
    options: &LibraryImportOptions,
) -> Result<LibraryItem> {
    create_item_from_path_with_id(
        app,
        storage,
        source_path,
        options,
        Uuid::new_v4().to_string(),
    )
}

pub(crate) fn create_item_from_path_with_id(
    app: &AppHandle<AppRuntime>,
    storage: Arc<StorageManager>,
    source_path: &Path,
    options: &LibraryImportOptions,
    id: String,
) -> Result<LibraryItem> {
    let remote_model = validate_import_model(app, &options.model_key)?;
    let source = ImportSource::inspect(source_path)?;
    let audio_path = library_root(app)?
        .join(build_folder_name(&source.title, &id))
        .join(format!("{id}.wav"));
    let source_size = fs::metadata(source_path)?.len();

    let item = LibraryItem {
        id,
        name: source.title,
        audio_path: audio_path.display().to_string(),
        source_path: source_path.display().to_string(),
        store_original: options.store_original,
        status: LibraryItemStatus::Pending,
        transcript: None,
        segments: None,
        words: None,
        duration_seconds: 0.0,
        file_size_bytes: source_size,
        original_format: source.extension,
        created_at: Utc::now().to_rfc3339(),
        transcribed_at: None,
        tags: Vec::new(),
        llm_cleanup_enabled: false,
        denoise_enabled: options.denoise_enabled,
        speech_model: options.model_key.clone(),
        show_timestamps: timestamp_policy(remote_model, options),
        detect_speakers: remote_model && options.detect_speakers,
        kind: crate::library::default_item_kind(),
        speakers: None,
    };
    storage.insert_library_item(item.clone())?;
    Ok(item)
}

struct ImportSource {
    title: String,
    extension: String,
}

impl ImportSource {
    fn inspect(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Err(anyhow!("File not found"));
        }
        let extension = normalized_extension(path);
        require_supported_extension(&extension)?;
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled")
            .to_owned();
        Ok(Self { title, extension })
    }
}

fn timestamp_policy(remote_model: bool, options: &LibraryImportOptions) -> bool {
    options.show_timestamps
        && (remote_model
            || model_manager::model_supports_capability(
                &options.model_key,
                model_manager::MODEL_CAPABILITY_TIMESTAMPS,
            ))
}

pub(crate) fn convert_library_item(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    id: &str,
    source_path: &Path,
    store_original: bool,
    token: &CancellationToken,
) -> Result<()> {
    convert_library_item_with_progress_range(
        app,
        state,
        id,
        source_path,
        store_original,
        token,
        0.0,
        1.0,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn convert_library_item_with_progress_range(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    id: &str,
    source_path: &Path,
    store_original: bool,
    token: &CancellationToken,
    progress_start: f32,
    progress_end: f32,
) -> Result<()> {
    require_active(token)?;
    let storage = state.storage();
    let item = storage
        .get_library_item(id)?
        .ok_or_else(|| anyhow!("Library item not found"))?;
    let extension = inspect_conversion_source(source_path)?;
    let audio_path = PathBuf::from(&item.audio_path);
    let item_dir = audio_path
        .parent()
        .ok_or_else(|| anyhow!("Library folder not found"))?
        .to_path_buf();
    fs::create_dir_all(&item_dir)
        .with_context(|| format!("Failed to create library folder at {}", item_dir.display()))?;

    let span = ProgressSpan::new(progress_start, progress_end, item.denoise_enabled);
    let job = ConversionJob {
        app,
        storage: storage.clone(),
        id,
        source_path,
        extension: &extension,
        audio_path: &audio_path,
        item_dir: &item_dir,
        token,
        span,
        denoise: item.denoise_enabled,
    };
    let duration_seconds = match job.run(store_original) {
        Ok(duration) => duration,
        Err(error) => {
            let _ = fs::remove_dir_all(&item_dir);
            return Err(error);
        }
    };
    let _ = storage.update_library_item(
        id,
        LibraryItemPatch {
            duration_seconds: Some(duration_seconds),
            ..Default::default()
        },
    );
    Ok(())
}

struct ConversionJob<'a> {
    app: &'a AppHandle<AppRuntime>,
    storage: Arc<StorageManager>,
    id: &'a str,
    source_path: &'a Path,
    extension: &'a str,
    audio_path: &'a Path,
    item_dir: &'a Path,
    token: &'a CancellationToken,
    span: ProgressSpan,
    denoise: bool,
}

impl ConversionJob<'_> {
    fn run(&self, store_original: bool) -> Result<f32> {
        self.report(self.span.start);
        require_active(self.token)?;
        if store_original {
            self.preserve_source()?;
        }

        let duration_ms = processing_tools::probe_media_duration_ms(self.source_path);
        let mut last_progress = 0.0f32;
        let mut on_progress = |value: f32| {
            let value = value.clamp(0.0, 1.0);
            if value >= 1.0 || value - last_progress >= 0.01 {
                self.report(self.span.map_conversion(value));
                last_progress = value;
            }
        };
        processing_audio::convert_to_wav(
            self.source_path,
            self.audio_path,
            self.extension,
            Some(self.token),
            duration_ms,
            Some(&mut on_progress),
        )?;

        if self.denoise {
            processing_tools::denoise_wav(self.audio_path, self.token)?;
            self.report(self.span.end);
        }
        require_active(self.token)?;
        processing_audio::wav_duration_seconds(self.audio_path)
    }

    fn preserve_source(&self) -> Result<()> {
        let target = self.item_dir.join(format!("source.{}", self.extension));
        let required = fs::metadata(self.source_path)
            .with_context(|| {
                format!(
                    "Failed to read file size for {}",
                    self.source_path.display()
                )
            })?
            .len();
        let available = fs2::available_space(self.item_dir).with_context(|| {
            format!(
                "Failed to read available disk space for {}",
                self.item_dir.display()
            )
        })?;
        if available < required {
            return Err(anyhow!(
                "Insufficient disk space to store original file (need {} bytes, have {} bytes)",
                required,
                available
            ));
        }
        fs::copy(self.source_path, &target)
            .with_context(|| format!("Failed to copy original file to {}", target.display()))?;
        Ok(())
    }

    fn report(&self, progress: f32) {
        report_import_progress(self.app, self.storage.clone(), self.id, progress);
    }
}

#[derive(Clone, Copy)]
struct ProgressSpan {
    start: f32,
    end: f32,
    conversion_end: f32,
}

impl ProgressSpan {
    fn new(start: f32, end: f32, includes_denoise: bool) -> Self {
        let conversion_end = if includes_denoise {
            start + (end - start) * 0.85
        } else {
            end
        };
        Self {
            start,
            end,
            conversion_end,
        }
    }

    fn map_conversion(self, progress: f32) -> f32 {
        self.start + progress * (self.conversion_end - self.start)
    }
}

fn inspect_conversion_source(path: &Path) -> Result<String> {
    if !path.exists() {
        return Err(anyhow!("File not found"));
    }
    let extension = normalized_extension(path);
    require_supported_extension(&extension)?;
    Ok(extension)
}

fn normalized_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn require_supported_extension(extension: &str) -> Result<()> {
    if SUPPORTED_AUDIO_FORMATS.contains(&extension) || SUPPORTED_VIDEO_FORMATS.contains(&extension)
    {
        Ok(())
    } else {
        Err(anyhow!("Unsupported file format: {extension}"))
    }
}

fn require_active(token: &CancellationToken) -> Result<()> {
    if token.is_cancelled() {
        Err(cancelled_error())
    } else {
        Ok(())
    }
}

pub(crate) fn report_import_progress(
    app: &AppHandle<AppRuntime>,
    storage: Arc<StorageManager>,
    id: &str,
    progress: f32,
) {
    let progress = progress.clamp(0.0, 1.0);
    let _ = storage.update_library_item(
        id,
        LibraryItemPatch {
            status: Some(LibraryItemStatus::Importing { progress }),
            ..Default::default()
        },
    );
    let _ = app.emit(
        EVENT_LIBRARY_IMPORT_PROGRESS,
        LibraryImportProgressPayload {
            id: id.to_owned(),
            progress,
        },
    );
}

pub(crate) fn validate_import_model(app: &AppHandle<AppRuntime>, model_key: &str) -> Result<bool> {
    let remote = crate::remote_speech::is_remote_model(model_key);
    if remote {
        return Ok(true);
    }
    let status = model_manager::check_model_status(app.clone(), model_key.to_owned())
        .map_err(|error| anyhow!(error))?;
    if status.installed {
        Ok(false)
    } else {
        Err(anyhow!("Selected model is not installed"))
    }
}

pub(crate) fn build_folder_name(base: &str, id: &str) -> String {
    let slug = FolderSlug::from_title(base).finish();
    let prefix = &id[..8];
    if slug.is_empty() {
        format!("library-item-{prefix}")
    } else {
        format!("{slug}-{prefix}")
    }
}

struct FolderSlug {
    text: String,
    separator_open: bool,
}

impl FolderSlug {
    fn from_title(title: &str) -> Self {
        title.chars().fold(
            Self {
                text: String::new(),
                separator_open: true,
            },
            |mut slug, character| {
                if character.is_ascii_alphanumeric() {
                    slug.text.push(character.to_ascii_lowercase());
                    slug.separator_open = false;
                } else if matches!(character, ' ' | '-' | '_') && !slug.separator_open {
                    slug.text.push('-');
                    slug.separator_open = true;
                }
                slug
            },
        )
    }

    fn finish(self) -> String {
        self.text.trim_matches('-').to_owned()
    }
}

pub(crate) fn library_root(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    let mut root = app
        .path()
        .app_data_dir()
        .context("App data directory not found")?;
    root.push("library");
    Ok(root)
}

pub(crate) fn stored_original_path(item: &LibraryItem) -> Option<PathBuf> {
    if !item.store_original {
        return None;
    }
    let extension = item.original_format.trim();
    if extension.is_empty() {
        return None;
    }
    PathBuf::from(&item.audio_path)
        .parent()
        .map(|directory| directory.join(format!("source.{extension}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_policy_normalizes_only_safe_ascii_separators() {
        let id = "12345678-rest";
        assert_eq!(
            build_folder_name(" Team__Sync--Q3 ", id),
            "team-sync-q3-12345678"
        );
        assert_eq!(build_folder_name("Café.v2", id), "cafv2-12345678");
        assert_eq!(build_folder_name("!!!", id), "library-item-12345678");
    }

    #[test]
    fn progress_span_reserves_the_last_fifteen_percent_for_denoise() {
        let plain = ProgressSpan::new(0.2, 0.8, false);
        let denoised = ProgressSpan::new(0.2, 0.8, true);
        assert!((plain.map_conversion(1.0) - 0.8).abs() < f32::EPSILON);
        assert!((denoised.map_conversion(1.0) - 0.71).abs() < f32::EPSILON);
    }

    #[test]
    fn extension_policy_is_case_insensitive_at_the_path_boundary() {
        assert_eq!(normalized_extension(Path::new("meeting.WAV")), "wav");
        assert!(require_supported_extension("wav").is_ok());
        assert_eq!(
            require_supported_extension("exe").unwrap_err().to_string(),
            "Unsupported file format: exe"
        );
    }
}
