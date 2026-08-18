#[cfg(target_os = "macos")]
use std::sync::OnceLock;
use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Result;
#[cfg(target_os = "macos")]
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::{AppRuntime, AppState, LibraryJob, LibraryJobKind};

#[cfg(target_os = "macos")]
use super::super::types::EVENT_LIBRARY_OPEN_IMPORT;
use super::super::{
    processing::{create_item_from_path, library_root, probe_media_duration_ms},
    queue::schedule_library_job,
    types::{LibraryImportOptions, LibraryItem},
    watch::{scan_watch_folders, LibraryWatchFolder},
    youtube::{create_youtube_item, probe_youtube_metadata, YoutubeImportMetadata},
};

#[cfg(target_os = "macos")]
#[derive(Default)]
struct PendingImport {
    renderer_ready: bool,
    paths: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct LibraryImportFileProbe {
    pub path: String,
    pub duration_ms: Option<u64>,
    pub size_bytes: Option<u64>,
}

pub(super) fn create_item(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    path: String,
    options: LibraryImportOptions,
) -> Result<LibraryItem, String> {
    let source_path = PathBuf::from(path);
    let item = create_item_from_path(app, state.storage(), &source_path, &options)
        .map_err(|error| error.to_string())?;
    let job = LibraryJob {
        id: item.id.clone(),
        kind: LibraryJobKind::Import {
            source_path,
            store_original: options.store_original,
        },
    };
    schedule_library_job(app, state, job);
    Ok(item)
}

pub(super) fn watch_folders(state: &AppState) -> Result<Vec<LibraryWatchFolder>, String> {
    state
        .storage()
        .get_library_watch_folders()
        .map_err(|error| format!("Failed to load watch folders: {error}"))
}

pub(super) fn add_watch_folder(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    path: String,
    options: LibraryImportOptions,
) -> Result<LibraryWatchFolder, String> {
    let canonical = fs::canonicalize(PathBuf::from(path.trim()))
        .map_err(|error| format!("Could not open watch folder: {error}"))?;
    validate_watch_folder(app, &canonical, &options)?;

    let folder = LibraryWatchFolder {
        path: canonical.to_string_lossy().into_owned(),
        options,
        enabled: true,
    };
    state
        .storage()
        .upsert_library_watch_folder(&folder)
        .map_err(|error| format!("Failed to save watch folder: {error}"))?;
    if let Err(error) = scan_watch_folders(app, super::super::watch::minimum_file_age()) {
        tracing::warn!("[watch-folders] Initial scan failed: {error}");
    }
    Ok(folder)
}

pub(super) fn remove_watch_folder(state: &AppState, path: String) -> Result<(), String> {
    state
        .storage()
        .remove_library_watch_folder(path.trim())
        .map_err(|error| format!("Failed to remove watch folder: {error}"))
}

pub(super) fn scan_watch_folders_now(app: &AppHandle<AppRuntime>) -> Result<usize, String> {
    scan_watch_folders(app, super::super::watch::minimum_file_age())
        .map_err(|error| format!("Failed to scan watch folders: {error}"))
}

pub(super) async fn probe_youtube(url: String) -> Result<YoutubeImportMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || probe_youtube_metadata(&url))
        .await
        .map_err(|error| format!("YouTube metadata task failed: {error}"))?
        .map_err(|error| error.to_string())
}

pub(super) fn create_youtube(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    metadata: YoutubeImportMetadata,
    options: LibraryImportOptions,
) -> Result<LibraryItem, String> {
    super::super::youtube::validate_youtube_url(&metadata.url)
        .map_err(|error| error.to_string())?;
    let item =
        create_youtube_item(app, state, &metadata, &options).map_err(|error| error.to_string())?;
    schedule_library_job(
        app,
        state,
        LibraryJob {
            id: item.id.clone(),
            kind: LibraryJobKind::ImportYoutube {
                url: metadata.url,
                store_original: options.store_original,
            },
        },
    );
    Ok(item)
}

pub(super) async fn probe_files(paths: Vec<String>) -> Vec<LibraryImportFileProbe> {
    tauri::async_runtime::spawn_blocking(move || paths.into_iter().map(probe_file).collect())
        .await
        .unwrap_or_default()
}

fn probe_file(path: String) -> LibraryImportFileProbe {
    let file_path = Path::new(&path);
    LibraryImportFileProbe {
        duration_ms: probe_media_duration_ms(file_path),
        size_bytes: fs::metadata(file_path).ok().map(|metadata| metadata.len()),
        path,
    }
}

fn validate_watch_folder(
    app: &AppHandle<AppRuntime>,
    path: &Path,
    options: &LibraryImportOptions,
) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Watch folder must be a directory".to_owned());
    }
    if options.model_key.trim().is_empty() {
        return Err("Choose a transcription model before watching a folder".to_owned());
    }
    let managed_root =
        library_root(app).and_then(|root| fs::canonicalize(root).map_err(anyhow::Error::from));
    if managed_root.is_ok_and(|root| path.starts_with(root)) {
        return Err("The Looper Library folder cannot watch itself".to_owned());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn pending_import() -> &'static Mutex<PendingImport> {
    static PENDING: OnceLock<Mutex<PendingImport>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(PendingImport::default()))
}

#[cfg(target_os = "macos")]
fn flush_pending(app: &AppHandle<AppRuntime>) {
    let paths = {
        let mut pending = pending_import().lock();
        if !pending.renderer_ready || pending.paths.is_empty() {
            return;
        }
        std::mem::take(&mut pending.paths)
    };
    let _ = app.emit(EVENT_LIBRARY_OPEN_IMPORT, paths);
}

#[cfg(target_os = "macos")]
pub(super) fn mark_renderer_ready(app: &AppHandle<AppRuntime>) {
    pending_import().lock().renderer_ready = true;
    flush_pending(app);
}

#[cfg(target_os = "macos")]
pub(super) fn handle_opened_paths(app: &AppHandle<AppRuntime>, urls: Vec<PathBuf>) -> Result<()> {
    let state = app.state::<AppState>();
    if super::authorize_library_command(&state).is_err() {
        open_settings(app);
        return Ok(());
    }
    let paths = urls
        .into_iter()
        .filter(|path| path.is_file())
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    if paths.is_empty() {
        return Ok(());
    }
    pending_import().lock().paths = paths;
    open_settings(app);
    flush_pending(app);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_settings(app: &AppHandle<AppRuntime>) {
    if let Err(error) = crate::tray::toggle_settings_window(app) {
        tracing::error!("Failed to open settings window: {error}");
    }
}
