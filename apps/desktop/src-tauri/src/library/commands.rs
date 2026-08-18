mod files;
mod imports;
mod items;
mod recovery;
mod translations;

#[cfg(target_os = "macos")]
use std::path::PathBuf;

#[cfg(target_os = "macos")]
use anyhow::Result;
use tauri::AppHandle;

use super::{
    types::{
        ExportFormat, LibraryFilter, LibraryImportOptions, LibraryItem, LibraryItemPatch,
        LibraryItemsPage, LibraryTranslation,
    },
    watch::LibraryWatchFolder,
    youtube::YoutubeImportMetadata,
};
use crate::{AppRuntime, AppState};

pub use imports::LibraryImportFileProbe;

fn authorize_library_command(state: &AppState) -> Result<(), String> {
    let settings = &state.settings_store;
    crate::license::require_license_gate(settings, "Library")
}

#[cfg(target_os = "macos")]
pub(crate) fn mark_library_import_renderer_ready(app: &AppHandle<AppRuntime>) {
    imports::mark_renderer_ready(app);
}

#[tauri::command]
pub fn create_library_item(
    path: String,
    options: LibraryImportOptions,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryItem, String> {
    authorize_library_command(&state)?;
    imports::create_item(&app, &state, path, options)
}

#[tauri::command]
pub fn get_library_watch_folders(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryWatchFolder>, String> {
    imports::watch_folders(&state)
}

#[tauri::command]
pub fn add_library_watch_folder(
    path: String,
    options: LibraryImportOptions,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryWatchFolder, String> {
    authorize_library_command(&state)?;
    imports::add_watch_folder(&app, &state, path, options)
}

#[tauri::command]
pub fn remove_library_watch_folder(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    authorize_library_command(&state)?;
    imports::remove_watch_folder(&state, path)
}

#[tauri::command]
pub fn scan_library_watch_folders_now(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    authorize_library_command(&state)?;
    imports::scan_watch_folders_now(&app)
}

#[tauri::command]
pub async fn probe_library_youtube_url(
    url: String,
    state: tauri::State<'_, AppState>,
) -> Result<YoutubeImportMetadata, String> {
    authorize_library_command(&state)?;
    imports::probe_youtube(url).await
}

#[tauri::command]
pub fn create_library_youtube_item(
    metadata: YoutubeImportMetadata,
    options: LibraryImportOptions,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryItem, String> {
    authorize_library_command(&state)?;
    imports::create_youtube(&app, &state, metadata, options)
}

#[tauri::command]
pub fn get_library_translations(
    item_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<LibraryTranslation>, String> {
    authorize_library_command(&state)?;
    translations::list(&state, item_id)
}

#[tauri::command]
pub async fn translate_library_item(
    app: AppHandle<AppRuntime>,
    item_id: String,
    language: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryTranslation, String> {
    authorize_library_command(&state)?;
    translations::translate(&app, &state, item_id, language).await
}

#[tauri::command]
pub fn delete_library_translation(
    item_id: String,
    language: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    authorize_library_command(&state)?;
    translations::delete(&state, item_id, language)
}

#[tauri::command]
pub fn get_library_items_page(
    filter: Option<LibraryFilter>,
    limit: u32,
    offset: u32,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryItemsPage, String> {
    items::page(&state, filter, limit, offset)
}

#[tauri::command]
pub fn update_library_item(
    id: String,
    patch: LibraryItemPatch,
    state: tauri::State<'_, AppState>,
) -> Result<LibraryItem, String> {
    authorize_library_command(&state)?;
    items::update(&state, id, patch)
}

#[tauri::command]
pub fn delete_library_item(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    items::delete(&app, &state, id)
}

#[tauri::command]
pub fn cancel_library_transcription(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    items::cancel(&app, &state, id);
    Ok(())
}

#[tauri::command]
pub fn retry_library_transcription(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    authorize_library_command(&state)?;
    items::retry(&app, &state, id)
}

#[tauri::command]
pub fn export_library_item_to_path(
    id: String,
    format: ExportFormat,
    output_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    authorize_library_command(&state)?;
    items::export(&state, id, format, output_path)
}

#[tauri::command]
pub async fn probe_library_import_files(paths: Vec<String>) -> Vec<LibraryImportFileProbe> {
    imports::probe_files(paths).await
}

#[tauri::command]
pub fn get_library_tags(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    items::tags(&state)
}

pub(crate) fn recover_interrupted_library_items(app: &AppHandle<AppRuntime>) {
    recovery::recover_interrupted(app);
}

#[cfg(target_os = "macos")]
pub fn handle_opened_paths(app: &AppHandle<AppRuntime>, urls: Vec<PathBuf>) -> Result<()> {
    imports::handle_opened_paths(app, urls)
}
