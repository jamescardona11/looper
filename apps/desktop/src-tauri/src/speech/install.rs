use std::path::{Path, PathBuf};

use crate::AppRuntime;
use anyhow::{anyhow, Context, Result};
use looper_ts::{
    InstallEvent, InstallOptions, ModelSpec, ModelStatus as StoredModelStatus, ModelStore,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub use super::catalog::{
    definition, is_streaming_model, model_label, model_supports_capability, LocalModelEngine,
    ModelInfo, MODEL_CAPABILITY_DICTIONARY, MODEL_CAPABILITY_TIMESTAMPS,
};

const MODELS_ROOT: &str = "models";
const MODEL_UNAVAILABLE: &str = "This model is no longer available for download.";
const DOWNLOAD_PROGRESS_EVENT: &str = "download:progress";
const DOWNLOAD_COMPLETE_EVENT: &str = "download:complete";
const DOWNLOAD_ERROR_EVENT: &str = "download:error";
const DOWNLOAD_CANCELLED_EVENT: &str = "download:cancelled";

#[derive(Debug, Clone)]
pub struct ReadyModel {
    pub key: String,
    pub path: PathBuf,
    pub engine: LocalModelEngine,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct ModelStatus {
    pub key: String,
    pub installed: bool,
    pub ane_installed: bool,
    pub bytes_on_disk: u64,
    pub missing_files: Vec<String>,
    pub directory: String,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
struct DownloadProgressPayload {
    model: String,
    file: String,
    downloaded: u64,
    total: u64,
    percent: f64,
    verifying: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
struct DownloadCompletePayload {
    model: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
struct DownloadErrorPayload {
    model: String,
    error: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
struct DownloadCancelledPayload {
    model: String,
}

struct ProgressProjector<'a> {
    specification: &'a ModelSpec,
}

impl<'a> ProgressProjector<'a> {
    fn new(specification: &'a ModelSpec) -> Self {
        Self { specification }
    }

    fn project(&self, event: InstallEvent) -> DownloadProgressPayload {
        let Some(total) = self.declared_total() else {
            return Self::unchanged(event);
        };
        if event.verifying {
            return Self::verification(event, total);
        }

        let Some(position) = self
            .specification
            .files
            .iter()
            .position(|file| file.path == event.file)
        else {
            return DownloadProgressPayload {
                total,
                ..Self::unchanged(event)
            };
        };

        let completed = self.specification.files[..position]
            .iter()
            .filter_map(|file| file.size_bytes)
            .fold(0_u64, u64::saturating_add);
        let current_limit = self.specification.files[position]
            .size_bytes
            .unwrap_or(event.total);
        let downloaded = completed.saturating_add(event.downloaded.min(current_limit));
        let percent = Self::percentage(downloaded, total);

        DownloadProgressPayload {
            model: event.model,
            file: event.file,
            downloaded,
            total,
            percent,
            verifying: false,
        }
    }

    fn declared_total(&self) -> Option<u64> {
        self.specification
            .files
            .iter()
            .try_fold(0_u64, |sum, file| {
                file.size_bytes.map(|size| sum.saturating_add(size))
            })
    }

    fn unchanged(event: InstallEvent) -> DownloadProgressPayload {
        DownloadProgressPayload {
            model: event.model,
            file: event.file,
            downloaded: event.downloaded,
            total: event.total,
            percent: event.percent,
            verifying: event.verifying,
        }
    }

    fn verification(event: InstallEvent, total: u64) -> DownloadProgressPayload {
        DownloadProgressPayload {
            model: event.model,
            file: event.file,
            downloaded: total,
            total,
            percent: 100.0,
            verifying: true,
        }
    }

    fn percentage(downloaded: u64, total: u64) -> f64 {
        if total == 0 {
            return 0.0;
        }
        ((downloaded as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
    }
}

#[derive(Clone)]
struct DownloadEvents {
    app: AppHandle<AppRuntime>,
    requested_model: String,
}

impl DownloadEvents {
    fn new(app: AppHandle<AppRuntime>, requested_model: String) -> Self {
        Self {
            app,
            requested_model,
        }
    }

    fn progress(&self, specification: &ModelSpec, event: InstallEvent) {
        let payload = ProgressProjector::new(specification).project(event);
        let _ = self.app.emit(DOWNLOAD_PROGRESS_EVENT, payload);
    }

    fn cancelled(&self) {
        let _ = self.app.emit(
            DOWNLOAD_CANCELLED_EVENT,
            DownloadCancelledPayload {
                model: self.requested_model.clone(),
            },
        );
    }

    fn failed(&self, message: &str) {
        let classification = FailureClassification::from_message(message);
        crate::analytics::track_model_download_failed(
            &self.app,
            &self.requested_model,
            classification.stage,
            classification.reason,
        );
        let _ = self.app.emit(
            DOWNLOAD_ERROR_EVENT,
            DownloadErrorPayload {
                model: self.requested_model.clone(),
                error: message.to_owned(),
            },
        );
    }

    fn track_preflight_failure(&self, stage: &'static str, message: String) -> String {
        crate::analytics::track_model_download_failed(
            &self.app,
            &self.requested_model,
            stage,
            crate::analytics::classify_failure_reason(&message),
        );
        message
    }

    fn completed(&self, installed: &StoredModelStatus) {
        let _ = self.app.emit(
            DOWNLOAD_COMPLETE_EVENT,
            DownloadCompletePayload {
                model: installed.id.clone(),
            },
        );
        crate::analytics::track_model_downloaded(&self.app, &installed.id);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FailureClassification {
    stage: &'static str,
    reason: &'static str,
}

impl FailureClassification {
    fn from_message(message: &str) -> Self {
        let reason = crate::analytics::classify_failure_reason(message);
        let stage = match reason {
            "verification" => "verify",
            "storage" => "install",
            _ => "download",
        };
        Self { stage, reason }
    }
}

struct ModelRepository {
    root: PathBuf,
    store: ModelStore,
}

impl ModelRepository {
    fn at(root: PathBuf) -> Self {
        Self {
            store: ModelStore::new(root.clone()),
            root,
        }
    }

    fn for_app<R: Runtime>(app: &AppHandle<R>) -> Result<Self> {
        Ok(Self::at(model_cache_dir(app)?))
    }

    fn prepare_root(&self) -> Result<()> {
        std::fs::create_dir_all(&self.root).context("Failed to prepare models directory")
    }

    fn status(&self, specification: &ModelSpec) -> Result<ModelStatus> {
        Ok(status_for_frontend(self.store.status(specification)?))
    }

    fn is_installed(&self, specification: &ModelSpec) -> bool {
        self.status(specification)
            .map(|status| status.installed)
            .unwrap_or(false)
    }

    fn ready(&self, model: &str) -> Result<ReadyModel> {
        let specification = specification_for(model)?;
        let resolved = self.store.resolve(&specification)?;
        let engine = super::catalog::definition(model)
            .ok_or_else(|| anyhow!("Unknown model: {model}"))?
            .engine;
        Ok(ReadyModel {
            key: resolved.id,
            path: resolved.directory,
            engine,
        })
    }

    fn delete(&self, model: &str) -> Result<ModelStatus> {
        Ok(status_for_frontend(self.store.delete(model)?))
    }
}

fn specification_for(model: &str) -> Result<ModelSpec> {
    super::catalog::install_spec(model).ok_or_else(|| anyhow!("Unknown model: {model}"))
}

fn status_for_frontend(status: StoredModelStatus) -> ModelStatus {
    ModelStatus {
        key: status.id,
        installed: status.installed,
        ane_installed: false,
        bytes_on_disk: status.bytes_on_disk,
        missing_files: status.missing_files,
        directory: status.directory,
    }
}

pub(crate) fn check_model_installed_at(models_dir: &Path, model: &str) -> bool {
    let Some(specification) = specification_for(model).ok() else {
        return false;
    };
    ModelRepository::at(models_dir.to_path_buf()).is_installed(&specification)
}

pub fn model_cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let mut directory = app
        .path()
        .app_data_dir()
        .context("Unable to resolve app data directory")?;
    directory.push(MODELS_ROOT);
    Ok(directory)
}

#[tauri::command]
pub fn list_models() -> Vec<ModelInfo> {
    super::catalog::list_local_models()
}

#[tauri::command]
pub fn check_model_status<R: Runtime>(
    app: AppHandle<R>,
    model: String,
) -> Result<ModelStatus, String> {
    let repository = ModelRepository::for_app(&app).map_err(|error| error.to_string())?;
    let specification = specification_for(&model).map_err(|error| error.to_string())?;
    repository
        .status(&specification)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle<AppRuntime>,
    state: tauri::State<'_, crate::AppState>,
    model: String,
    _ane: Option<bool>,
) -> Result<ModelStatus, String> {
    if !super::catalog::model_is_downloadable(&model) {
        return Err(MODEL_UNAVAILABLE.to_owned());
    }

    let events = DownloadEvents::new(app.clone(), model.clone());
    super::catalog::ensure_model_mirror_configured()
        .map_err(|error| events.track_preflight_failure("resolve", error.to_string()))?;
    let repository = ModelRepository::for_app(&app)
        .map_err(|error| events.track_preflight_failure("resolve", error.to_string()))?;
    let specification = specification_for(&model)
        .map_err(|error| events.track_preflight_failure("resolve", error.to_string()))?;
    repository
        .prepare_root()
        .map_err(|error| events.track_preflight_failure("install", error.to_string()))?;

    let cancellation = state.create_download_token(&model);
    let progress_events = events.clone();
    let progress_specification = specification.clone();
    let progress = move |event| progress_events.progress(&progress_specification, event);
    let result = repository
        .store
        .install(
            &specification,
            InstallOptions {
                cancel_token: Some(cancellation.clone()),
                progress: Some(&progress),
            },
        )
        .await;

    state.clear_download_token(&model);

    let installed = match result {
        Ok(status) => status,
        Err(_error) if cancellation.is_cancelled() => {
            events.cancelled();
            return repository
                .status(&specification)
                .map_err(|status_error| status_error.to_string());
        }
        Err(error) => {
            let message = error.to_string();
            events.failed(&message);
            return Err(message);
        }
    };

    events.completed(&installed);
    let settings = state.current_settings();
    if let Err(error) = crate::tray::refresh_tray_menu(&app, &settings) {
        tracing::error!("Failed to refresh tray menu after download: {error}");
    }
    Ok(status_for_frontend(installed))
}

#[tauri::command]
pub fn delete_model(app: AppHandle<AppRuntime>, model: String) -> Result<ModelStatus, String> {
    let repository = ModelRepository::for_app(&app).map_err(|error| error.to_string())?;
    let status = repository
        .delete(&model)
        .map_err(|error| error.to_string())?;

    if let Some(state) = app.try_state::<crate::AppState>() {
        let settings = state.current_settings();
        if let Err(error) = crate::tray::refresh_tray_menu(&app, &settings) {
            tracing::error!("Failed to refresh tray menu after delete: {error}");
        }
    }
    Ok(status)
}

#[tauri::command]
pub fn cancel_download(
    model: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<bool, String> {
    Ok(state.cancel_download(&model))
}

pub fn ensure_model_ready<R: Runtime>(app: &AppHandle<R>, model: &str) -> Result<ReadyModel> {
    ensure_model_ready_at(&model_cache_dir(app)?, model)
}

pub(crate) fn ensure_model_ready_at(models_dir: &Path, model: &str) -> Result<ReadyModel> {
    ModelRepository::at(models_dir.to_path_buf()).ready(model)
}

pub fn ensure_local_fallback_model<R: Runtime>(
    app: &AppHandle<R>,
    preferred: &str,
) -> Result<ReadyModel> {
    ensure_local_fallback_model_at(&model_cache_dir(app)?, preferred)
}

pub(crate) fn ensure_local_fallback_model_at(
    models_dir: &Path,
    preferred: &str,
) -> Result<ReadyModel> {
    let repository = ModelRepository::at(models_dir.to_path_buf());
    if let Ok(model) = repository.ready(preferred) {
        return Ok(model);
    }

    for candidate in super::catalog::local_manifests()
        .map(|manifest| manifest.id)
        .filter(|candidate| *candidate != preferred)
    {
        if let Ok(model) = repository.ready(candidate) {
            tracing::error!(
                "[LocalTranscriber] Using installed local model `{candidate}` for remote fallback (preferred `{preferred}` is unavailable)"
            );
            return Ok(model);
        }
    }
    Err(anyhow!(
        "No local transcription model is installed for fallback"
    ))
}

#[cfg(test)]
mod contract_tests {
    use std::{fs, fs::OpenOptions};

    use looper_ts::RemoteFile;
    use serde_json::json;
    use tempfile::TempDir;

    use super::*;

    fn file(path: &str, size: Option<u64>) -> RemoteFile {
        RemoteFile {
            url: format!("https://models.example.test/{path}"),
            path: path.to_owned(),
            size_bytes: size,
            sha256: None,
        }
    }

    fn progress_specification(sizes: [Option<u64>; 2]) -> ModelSpec {
        ModelSpec {
            id: "contract-model".to_owned(),
            files: vec![
                file("encoder.onnx", sizes[0]),
                file("decoder.onnx", sizes[1]),
            ],
        }
    }

    fn progress_event(file: &str, downloaded: u64, total: u64) -> InstallEvent {
        InstallEvent {
            model: "contract-model".to_owned(),
            file: file.to_owned(),
            downloaded,
            total,
            percent: if total == 0 {
                0.0
            } else {
                downloaded as f64 * 100.0 / total as f64
            },
            verifying: false,
        }
    }

    fn materialize_specification(root: &Path, specification: &ModelSpec) {
        let model_directory = root.join(&specification.id);
        for remote in &specification.files {
            let target = model_directory.join(&remote.path);
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            let output = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(target)
                .unwrap();
            output.set_len(remote.size_bytes.unwrap_or(0)).unwrap();
        }
    }

    fn first_platform_model() -> (&'static str, LocalModelEngine, ModelSpec) {
        let manifest = super::super::catalog::local_manifests()
            .next()
            .expect("platform has a local speech model");
        (
            manifest.id,
            manifest.engine,
            specification_for(manifest.id).unwrap(),
        )
    }

    #[test]
    fn progress_accumulates_completed_files() {
        let specification = progress_specification([Some(100), Some(300)]);
        let payload = ProgressProjector::new(&specification).project(progress_event(
            "decoder.onnx",
            150,
            300,
        ));
        assert_eq!(payload.downloaded, 250);
        assert_eq!(payload.total, 400);
        assert_eq!(payload.percent, 62.5);
        assert!(!payload.verifying);
    }

    #[test]
    fn progress_clamps_the_current_file_and_percentage() {
        let specification = progress_specification([Some(100), Some(300)]);
        let payload = ProgressProjector::new(&specification).project(progress_event(
            "decoder.onnx",
            900,
            900,
        ));
        assert_eq!(payload.downloaded, 400);
        assert_eq!(payload.percent, 100.0);
    }

    #[test]
    fn unknown_file_keeps_event_measurements_but_uses_declared_model_total() {
        let specification = progress_specification([Some(100), Some(300)]);
        let payload = ProgressProjector::new(&specification).project(progress_event(
            "future-file.onnx",
            25,
            50,
        ));
        assert_eq!(payload.downloaded, 25);
        assert_eq!(payload.total, 400);
        assert_eq!(payload.percent, 50.0);
    }

    #[test]
    fn missing_declared_size_preserves_original_event() {
        let specification = progress_specification([Some(100), None]);
        let event = progress_event("decoder.onnx", 40, 80);
        let payload = ProgressProjector::new(&specification).project(event.clone());
        assert_eq!(payload.model, event.model);
        assert_eq!(payload.file, event.file);
        assert_eq!(payload.downloaded, event.downloaded);
        assert_eq!(payload.total, event.total);
        assert_eq!(payload.percent, event.percent);
    }

    #[test]
    fn verification_uses_complete_declared_model_size() {
        let specification = progress_specification([Some(100), Some(300)]);
        let mut event = progress_event("", 0, 0);
        event.percent = 100.0;
        event.verifying = true;
        let payload = ProgressProjector::new(&specification).project(event);
        assert_eq!(payload.downloaded, 400);
        assert_eq!(payload.total, 400);
        assert_eq!(payload.percent, 100.0);
        assert!(payload.verifying);
    }

    #[test]
    fn zero_sized_model_reports_zero_download_percentage() {
        let specification = progress_specification([Some(0), Some(0)]);
        let payload =
            ProgressProjector::new(&specification).project(progress_event("encoder.onnx", 10, 10));
        assert_eq!(payload.downloaded, 0);
        assert_eq!(payload.total, 0);
        assert_eq!(payload.percent, 0.0);
    }

    #[test]
    fn progress_payload_keeps_frontend_wire_keys() {
        let specification = progress_specification([Some(100), Some(300)]);
        let payload =
            ProgressProjector::new(&specification).project(progress_event("encoder.onnx", 25, 100));
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            json!({
                "model": "contract-model",
                "file": "encoder.onnx",
                "downloaded": 25,
                "total": 400,
                "percent": 6.25,
                "verifying": false
            })
        );
    }

    #[test]
    fn terminal_payloads_keep_frontend_wire_shapes() {
        assert_eq!(
            serde_json::to_value(DownloadCompletePayload {
                model: "ready".to_owned()
            })
            .unwrap(),
            json!({ "model": "ready" })
        );
        assert_eq!(
            serde_json::to_value(DownloadErrorPayload {
                model: "failed".to_owned(),
                error: "network".to_owned()
            })
            .unwrap(),
            json!({ "model": "failed", "error": "network" })
        );
        assert_eq!(
            serde_json::to_value(DownloadCancelledPayload {
                model: "cancelled".to_owned()
            })
            .unwrap(),
            json!({ "model": "cancelled" })
        );
    }

    #[test]
    fn failure_classification_routes_verification_and_storage_stages() {
        assert_eq!(
            FailureClassification::from_message("checksum mismatch"),
            FailureClassification {
                stage: "verify",
                reason: "verification"
            }
        );
        assert_eq!(
            FailureClassification::from_message("disk write failed"),
            FailureClassification {
                stage: "install",
                reason: "storage"
            }
        );
        assert_eq!(
            FailureClassification::from_message("network connection failed"),
            FailureClassification {
                stage: "download",
                reason: "network"
            }
        );
    }

    #[test]
    fn unknown_model_is_never_reported_as_installed() {
        let directory = TempDir::new().unwrap();
        assert!(!check_model_installed_at(
            directory.path(),
            "not-in-catalog"
        ));
        assert_eq!(
            ensure_model_ready_at(directory.path(), "not-in-catalog")
                .unwrap_err()
                .to_string(),
            "Unknown model: not-in-catalog"
        );
    }

    #[test]
    fn repository_status_lists_missing_files_before_installation() {
        let directory = TempDir::new().unwrap();
        let (_, _, specification) = first_platform_model();
        let status = ModelRepository::at(directory.path().to_path_buf())
            .status(&specification)
            .unwrap();
        assert!(!status.installed);
        assert_eq!(status.missing_files.len(), specification.files.len());
        assert_eq!(status.bytes_on_disk, 0);
        assert!(!status.ane_installed);
    }

    #[test]
    fn complete_cached_files_resolve_to_ready_model() {
        let directory = TempDir::new().unwrap();
        let (model_id, engine, specification) = first_platform_model();
        materialize_specification(directory.path(), &specification);

        let ready = ensure_model_ready_at(directory.path(), model_id).unwrap();
        assert_eq!(ready.key, model_id);
        assert_eq!(ready.path, directory.path().join(model_id));
        assert_eq!(ready.engine, engine);
        assert!(check_model_installed_at(directory.path(), model_id));
    }

    #[test]
    fn delete_removes_cached_model_and_maps_frontend_status() {
        let directory = TempDir::new().unwrap();
        let (model_id, _, specification) = first_platform_model();
        materialize_specification(directory.path(), &specification);
        let repository = ModelRepository::at(directory.path().to_path_buf());

        let status = repository.delete(model_id).unwrap();
        assert_eq!(status.key, model_id);
        assert!(!status.installed);
        assert_eq!(status.bytes_on_disk, 0);
        assert!(status.missing_files.is_empty());
        assert!(!directory.path().join(model_id).exists());
    }

    #[test]
    fn preferred_ready_model_wins_without_searching_fallbacks() {
        let directory = TempDir::new().unwrap();
        let (model_id, _, specification) = first_platform_model();
        materialize_specification(directory.path(), &specification);
        let ready = ensure_local_fallback_model_at(directory.path(), model_id).unwrap();
        assert_eq!(ready.key, model_id);
    }

    #[test]
    fn first_installed_catalog_model_replaces_unavailable_preference() {
        let directory = TempDir::new().unwrap();
        let (model_id, _, specification) = first_platform_model();
        materialize_specification(directory.path(), &specification);
        let ready = ensure_local_fallback_model_at(directory.path(), "missing-preference").unwrap();
        assert_eq!(ready.key, model_id);
    }

    #[test]
    fn fallback_reports_when_no_catalog_model_is_installed() {
        let directory = TempDir::new().unwrap();
        assert_eq!(
            ensure_local_fallback_model_at(directory.path(), "missing-preference")
                .unwrap_err()
                .to_string(),
            "No local transcription model is installed for fallback"
        );
    }
}
