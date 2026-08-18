use std::path::PathBuf;

use tauri::AppHandle;

use super::super::contracts::AppRuntime;
use super::super::state::AppState;
use crate::{core, recent_transcriptions, storage, tray};

#[tauri::command]
pub(crate) fn get_transcriptions(
    state: tauri::State<AppState>,
) -> Result<Vec<storage::TranscriptionRecord>, String> {
    state
        .storage()
        .get_all()
        .map_err(|failure| format!("Failed to get transcriptions: {failure}"))
}

#[tauri::command]
pub(crate) fn mark_transcription_synced(
    id: String,
    state: tauri::State<AppState>,
) -> Result<bool, String> {
    state
        .storage()
        .mark_synced(&id)
        .map_err(|failure| format!("Failed to mark transcription synced: {failure}"))
}

#[tauri::command]
pub(crate) fn delete_transcription(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<bool, String> {
    let deleted = state
        .storage()
        .delete(&id)
        .map_err(|failure| format!("Failed to delete transcription: {failure}"))?
        .map(|audio| {
            let audio = PathBuf::from(audio);
            if audio.exists() {
                let _ = std::fs::remove_file(audio);
            }
            true
        })
        .unwrap_or(false);
    let settings = state.current_settings();
    if let Err(failure) = tray::refresh_tray_menu(&app, &settings) {
        tracing::error!("Failed to refresh tray menu: {failure}");
    }
    #[cfg(target_os = "macos")]
    if let Err(failure) = super::super::bootstrap::set_app_menu(&app, &settings) {
        tracing::error!("Failed to refresh app menu: {failure}");
    }
    Ok(deleted)
}

#[tauri::command]
pub(crate) async fn retry_transcription(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    core::transcriptions::retry_transcription(id, &app, &state)
}

#[tauri::command]
pub(crate) fn cancel_retry_transcription(
    id: String,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    Ok(state.cancel_retry_transcription(&id))
}

#[tauri::command]
pub(crate) async fn retry_llm_cleanup(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    core::transcriptions::retry_llm_cleanup(id, &app, &state)
}

#[tauri::command]
pub(crate) async fn undo_llm_cleanup(
    id: String,
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    core::transcriptions::undo_llm_cleanup(id, &app, &state)
}

#[tauri::command]
pub(crate) fn view_recovered_transcriptions(app: AppHandle<AppRuntime>) -> Result<(), String> {
    tray::open_settings_history(&app).map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn copy_last_transcription(
    app: AppHandle<AppRuntime>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let latest = state
        .storage()
        .get_recent_transcriptions(1)
        .map_err(|failure| format!("Failed to load transcriptions: {failure}"))?
        .into_iter()
        .next()
        .ok_or_else(|| "No transcription to copy".to_owned())?;
    recent_transcriptions::copy_transcription_to_clipboard(&app, &latest.id);
    Ok(())
}
