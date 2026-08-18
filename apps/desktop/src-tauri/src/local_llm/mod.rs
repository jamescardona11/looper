mod catalog;
mod download;
mod protocol;
mod runtime;
mod sidecar;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::{AppRuntime, AppState};

pub use catalog::{is_known_model, DEFAULT_MODEL_ID};
pub use runtime::LocalLlmRuntime;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LocalLlmModelState {
    NotInstalled,
    Downloading,
    Verifying,
    Ready,
    RuntimeError,
    LicenseRequired,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelStatus {
    pub model: String,
    pub state: LocalLlmModelState,
    pub bytes_on_disk: u64,
    pub total_bytes: u64,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingAiStatus {
    pub provider: String,
    pub model: Option<String>,
    pub state: LocalLlmModelState,
    pub actionable_message: Option<String>,
}

#[tauri::command]
pub fn list_local_llm_models() -> Vec<catalog::LocalLlmModelInfo> {
    vec![catalog::model_info()]
}

#[tauri::command]
pub fn get_local_llm_model_status(
    app: AppHandle<AppRuntime>,
    state: State<'_, AppState>,
    model: String,
) -> Result<LocalLlmModelStatus, String> {
    ensure_known(&model)?;
    let path = download::model_path(&app).map_err(|error| error.to_string())?;
    let partial = download::partial_path(&app).map_err(|error| error.to_string())?;
    let downloading = state.has_download_token(&download::download_key(&model));
    let bytes_on_disk = path
        .metadata()
        .or_else(|_| partial.metadata())
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let status = if download::is_ready(&app) {
        LocalLlmModelState::Ready
    } else if state.local_llm_verifying() {
        LocalLlmModelState::Verifying
    } else if downloading {
        LocalLlmModelState::Downloading
    } else if !crate::license::license_gate_active(&state.settings_store) {
        LocalLlmModelState::LicenseRequired
    } else {
        LocalLlmModelState::NotInstalled
    };
    Ok(LocalLlmModelStatus {
        model,
        state: status,
        bytes_on_disk,
        total_bytes: catalog::MODEL_SIZE_BYTES,
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn get_meeting_ai_status(
    app: AppHandle<AppRuntime>,
    state: State<'_, AppState>,
) -> MeetingAiStatus {
    let settings = state.current_settings_unmasked();
    if !crate::license::license_gate_active(&state.settings_store) {
        return MeetingAiStatus {
            provider: settings.meeting_ai_provider,
            model: None,
            state: LocalLlmModelState::LicenseRequired,
            actionable_message: Some(
                "An active trial or license is required for meeting intelligence.".into(),
            ),
        };
    }
    match settings.meeting_ai_provider.as_str() {
        "local" => {
            let ready = download::is_ready(&app);
            let verifying = state.local_llm_verifying();
            let downloading =
                state.has_download_token(&download::download_key(&settings.local_llm_model));
            MeetingAiStatus {
                provider: "local".into(),
                model: Some(settings.local_llm_model),
                state: if ready {
                    LocalLlmModelState::Ready
                } else if verifying {
                    LocalLlmModelState::Verifying
                } else if downloading {
                    LocalLlmModelState::Downloading
                } else {
                    LocalLlmModelState::NotInstalled
                },
                actionable_message: (!ready && !downloading)
                    .then(|| "Download Qwen in Settings -> Providers.".into()),
            }
        }
        "writing" => {
            let ready = crate::llm_cleanup::is_llm_available(&settings);
            MeetingAiStatus {
                provider: "writing".into(),
                model: (!settings.llm_model.trim().is_empty()).then_some(settings.llm_model),
                state: if ready {
                    LocalLlmModelState::Ready
                } else {
                    LocalLlmModelState::RuntimeError
                },
                actionable_message: (!ready)
                    .then(|| "Configure the writing provider in Settings -> Providers.".into()),
            }
        }
        _ => MeetingAiStatus {
            provider: "none".into(),
            model: None,
            state: LocalLlmModelState::NotInstalled,
            actionable_message: Some(
                "Enable meeting intelligence in Settings -> Providers.".into(),
            ),
        },
    }
}

#[tauri::command]
pub fn download_local_llm_model(
    app: AppHandle<AppRuntime>,
    state: State<'_, AppState>,
    model: String,
) -> Result<(), String> {
    ensure_known(&model)?;
    crate::license::require_license_gate(&state.settings_store, "the local language model")?;
    if download::is_ready(&app) {
        return Ok(());
    }
    let key = download::download_key(&model);
    if state.has_download_token(&key) {
        return Ok(());
    }
    let token = state.create_download_token(&key);
    download::spawn_download(app, model, token);
    Ok(())
}

#[tauri::command]
pub fn cancel_local_llm_model_download(
    state: State<'_, AppState>,
    model: String,
) -> Result<bool, String> {
    ensure_known(&model)?;
    Ok(state.cancel_download(&download::download_key(&model)))
}

#[tauri::command]
pub async fn delete_local_llm_model(
    app: AppHandle<AppRuntime>,
    state: State<'_, AppState>,
    model: String,
) -> Result<(), String> {
    ensure_known(&model)?;
    state.cancel_download(&download::download_key(&model));
    state.local_llm_runtime.shutdown().await;
    download::delete_artifacts(&app)
        .await
        .map_err(|error| error.to_string())
}

pub fn model_is_ready(app: &AppHandle<AppRuntime>) -> bool {
    download::is_ready(app)
}

pub async fn generate(
    app: &AppHandle<AppRuntime>,
    system_prompt: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    crate::license::require_license_gate(&state.settings_store, "the local language model")?;
    if !download::is_ready(app) {
        return Err("The local language model is not installed. Download it in Settings.".into());
    }
    let path = download::model_path(app).map_err(|error| error.to_string())?;
    state
        .local_llm_runtime
        .generate(&path, system_prompt, user_prompt, max_tokens)
        .await
        .map_err(|error| error.to_string())
}

pub fn run_sidecar() -> anyhow::Result<()> {
    sidecar::run()
}

fn ensure_known(model: &str) -> Result<(), String> {
    if catalog::is_known_model(model) {
        Ok(())
    } else {
        Err(format!("Unknown local LLM model: {model}"))
    }
}
