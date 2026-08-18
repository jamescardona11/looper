use std::path::{Path, PathBuf};

use anyhow::Result;
use tauri::async_runtime;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use super::super::contracts::{AppRuntime, FFMPEG_HELP_URL};
use super::super::recordings;
use super::super::state::AppState;
use crate::settings::RecordingPrunePolicy;
use crate::{data_export, llm_cleanup, model_manager, permissions, remote_api, speech, tray};

#[derive(serde::Serialize)]
pub(crate) struct RecordingPrunePreview {
    candidate_count: u32,
}

#[derive(serde::Serialize)]
pub(crate) struct AudioStorageBudgetPreview {
    current_bytes: u64,
    budget_bytes: u64,
    candidate_count: u32,
    candidate_bytes: u64,
}

#[derive(serde::Serialize)]
struct StorageBreakdown {
    recordings_bytes: u64,
    library_bytes: u64,
    databases_bytes: u64,
    models_bytes: u64,
    total_bytes: u64,
}

#[derive(serde::Serialize)]
pub(crate) struct AppInfo {
    version: String,
    data_dir_size_bytes: u64,
    data_dir_path: String,
    storage_breakdown: StorageBreakdown,
}

macro_rules! result_command {
    ($name:ident => $target:path) => {
        #[tauri::command]
        pub(crate) fn $name() -> Result<(), String> {
            $target()
        }
    };
}

macro_rules! bool_command {
    ($name:ident => $target:path) => {
        #[tauri::command]
        pub(crate) fn $name() -> bool {
            $target()
        }
    };
}

result_command!(open_accessibility_settings => permissions::open_accessibility_settings);
bool_command!(check_accessibility_permission => permissions::check_accessibility_permission);
bool_command!(check_microphone_permission => permissions::check_microphone_permission);
result_command!(request_microphone_permission => permissions::request_microphone_permission);
result_command!(open_microphone_settings => permissions::open_microphone_settings);
result_command!(open_system_audio_settings => permissions::open_system_audio_settings);
result_command!(open_input_monitoring_settings => permissions::open_input_monitoring_settings);
bool_command!(check_screen_capture_permission => permissions::check_screen_capture_permission);
bool_command!(request_screen_capture_permission => permissions::request_screen_capture_permission);
result_command!(open_screen_capture_settings => permissions::open_screen_capture_settings);

#[tauri::command]
pub(crate) fn open_llm_cleanup_settings(app: AppHandle<AppRuntime>) -> Result<(), String> {
    tray::open_settings_models(&app).map_err(|failure| {
        tracing::error!("Failed to open settings window: {failure}");
        failure.to_string()
    })
}

#[tauri::command]
pub(crate) fn open_ffmpeg_install(app: AppHandle<AppRuntime>) -> Result<(), String> {
    app.opener()
        .open_url(FFMPEG_HELP_URL, None::<&str>)
        .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) async fn preview_recording_prune(
    policy: RecordingPrunePolicy,
    app: AppHandle<AppRuntime>,
) -> Result<RecordingPrunePreview, String> {
    async_runtime::spawn_blocking(move || recordings::inspect_age_policy(&app, policy))
        .await
        .map_err(|failure| failure.to_string())?
        .map(|candidate_count| RecordingPrunePreview { candidate_count })
        .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) async fn preview_audio_storage_budget(
    budget_mb: u32,
    app: AppHandle<AppRuntime>,
) -> Result<AudioStorageBudgetPreview, String> {
    async_runtime::spawn_blocking(move || recordings::inspect_budget(&app, budget_mb))
        .await
        .map_err(|failure| failure.to_string())?
        .map(|preview| AudioStorageBudgetPreview {
            current_bytes: preview.current_bytes,
            budget_bytes: preview.limit_bytes,
            candidate_count: preview.candidate_count,
            candidate_bytes: preview.candidate_bytes,
        })
        .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) async fn preview_transcription_prune(
    policy: RecordingPrunePolicy,
    app: AppHandle<AppRuntime>,
) -> Result<RecordingPrunePreview, String> {
    async_runtime::spawn_blocking(move || {
        crate::transcribe::preview_transcription_prune_for_policy(&app, policy)
    })
    .await
    .map_err(|failure| failure.to_string())?
    .map(|candidate_count| RecordingPrunePreview { candidate_count })
    .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn get_app_info(app: AppHandle<AppRuntime>) -> Result<AppInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|failure| format!("Failed to get app data dir: {failure}"))?;
    let recordings_bytes = directory_size(&data_dir.join("recordings")).unwrap_or_default();
    let library_bytes = directory_size(&data_dir.join("library")).unwrap_or_default();
    let databases_bytes = [
        "transcriptions.db",
        "transcriptions.db-wal",
        "transcriptions.db-shm",
    ]
    .into_iter()
    .filter_map(|name| std::fs::metadata(data_dir.join(name)).ok())
    .map(|metadata| metadata.len())
    .sum();
    let models_bytes = model_manager::model_cache_dir(&app)
        .ok()
        .and_then(|directory| directory_size(&directory).ok())
        .unwrap_or_default();
    let total_bytes = directory_size(&data_dir).unwrap_or_default();
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        data_dir_size_bytes: total_bytes,
        data_dir_path: data_dir.display().to_string(),
        storage_breakdown: StorageBreakdown {
            recordings_bytes,
            library_bytes,
            databases_bytes,
            models_bytes,
            total_bytes,
        },
    })
}

#[tauri::command]
pub(crate) async fn export_complete_archive(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<data_export::CompleteExportReport, String> {
    let destination = PathBuf::from(path);
    if destination.extension().and_then(|value| value.to_str()) != Some("zip") {
        return Err("Complete export path must end in .zip".to_owned());
    }
    let storage = state.storage();
    async_runtime::spawn_blocking(move || {
        data_export::export_complete_archive(&storage, &destination)
    })
    .await
    .map_err(|failure| failure.to_string())?
    .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_llm_models(
    endpoint: String,
    api_key: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    llm_cleanup::fetch_available_models(&state.http(), &endpoint, &api_key)
        .await
        .map_err(|failure| llm_cleanup::llm_issue_message(&failure))
}

#[tauri::command]
pub(crate) fn list_speech_models(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, AppState>,
) -> Vec<speech::SpeechModel> {
    speech::list_models(&app, &state.current_settings())
}

#[tauri::command]
pub(crate) async fn fetch_remote_speech_models(
    endpoint: String,
    api_key: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    if endpoint.trim().is_empty() {
        return Ok(Vec::new());
    }
    remote_api::list_models(&state.http(), &endpoint, &api_key)
        .await
        .map_err(|failure| failure.user_message())
}

#[tauri::command]
pub(crate) fn set_cloud_auth_token(token: Option<String>, state: tauri::State<'_, AppState>) {
    state.set_cloud_auth_token(token);
}

#[tauri::command]
pub(crate) fn open_about_page(app: AppHandle<AppRuntime>) {
    if let Err(failure) = tray::open_settings_about(&app) {
        tracing::error!("Failed to open settings window: {failure}");
    }
}

#[tauri::command]
pub(crate) fn reveal_logs(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|failure| failure.to_string())?;
    app.opener()
        .open_path(directory.to_string_lossy(), None::<&str>)
        .map_err(|failure| failure.to_string())
}

#[tauri::command]
pub(crate) fn open_data_dir(
    path: Option<String>,
    app: AppHandle<AppRuntime>,
) -> Result<(), String> {
    let requested = PathBuf::from(path.ok_or_else(|| "Path is empty".to_owned())?);
    let root = app
        .path()
        .app_data_dir()
        .map_err(|failure| format!("Failed to get app data dir: {failure}"))?;
    let requested = requested
        .canonicalize()
        .map_err(|_| "Path does not exist".to_owned())?;
    let root = root
        .canonicalize()
        .map_err(|failure| format!("Failed to canonicalize data dir: {failure}"))?;
    if !requested.starts_with(&root) {
        return Err("Path is outside app data directory".to_owned());
    }
    app.opener()
        .reveal_item_in_dir(&requested)
        .map_err(|failure| format!("Failed to open path: {failure}"))
}

fn directory_size(path: &Path) -> Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let metadata = path.metadata()?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    let mut total = 0_u64;
    let mut pending = vec![path.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for item in std::fs::read_dir(directory)? {
            let item = item?;
            let metadata = item.metadata()?;
            if metadata.is_dir() {
                pending.push(item.path());
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    Ok(total)
}

pub(crate) fn check_permissions_on_startup(app: &AppHandle<AppRuntime>) {
    #[cfg(target_os = "macos")]
    {
        if !app
            .state::<AppState>()
            .current_settings()
            .onboarding_completed
        {
            return;
        }
        if !permissions::check_microphone_permission() {
            crate::toast::show_with_action(
                app,
                "error",
                Some("Microphone"),
                "Microphone access was turned off. Allow it again to keep dictating.",
                "open_microphone_settings",
                "Open Settings",
            );
            return;
        }
        if !permissions::check_accessibility_permission() {
            crate::toast::show_with_action(
                app,
                "warning",
                Some("Accessibility"),
                "Accessibility access was turned off. Allow it so Looper can type into other apps.",
                "open_accessibility_settings",
                "Open Settings",
            );
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::directory_size;
    use std::fs;

    #[test]
    fn directory_size_counts_nested_files_and_missing_paths_as_zero() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("nested")).unwrap();
        fs::write(temp.path().join("root.bin"), [0_u8; 3]).unwrap();
        fs::write(temp.path().join("nested/child.bin"), [0_u8; 5]).unwrap();
        assert_eq!(directory_size(temp.path()).unwrap(), 8);
        assert_eq!(directory_size(&temp.path().join("missing")).unwrap(), 0);
    }
}
