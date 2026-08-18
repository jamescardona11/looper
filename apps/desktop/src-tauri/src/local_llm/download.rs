use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

use crate::{AppRuntime, AppState};

use super::catalog::{
    MODEL_DIRECTORY, MODEL_FILE_NAME, MODEL_SHA256, MODEL_SIZE_BYTES, MODEL_URL,
    RETIRED_MODEL_DIRECTORIES,
};

pub const EVENT_PROGRESS: &str = "local-llm:download-progress";
pub const EVENT_COMPLETE: &str = "local-llm:download-complete";
pub const EVENT_ERROR: &str = "local-llm:download-error";
pub const EVENT_CANCELLED: &str = "local-llm:download-cancelled";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub verifying: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadResult {
    model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadFailure {
    model: String,
    error: String,
}

pub fn model_directory(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .context("resolve app data directory")?
        .join("models")
        .join("llm")
        .join(MODEL_DIRECTORY))
}

pub fn model_path(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    Ok(model_directory(app)?.join(MODEL_FILE_NAME))
}

pub fn partial_path(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    Ok(model_directory(app)?.join(format!("{MODEL_FILE_NAME}.part")))
}

pub fn verified_marker_path(app: &AppHandle<AppRuntime>) -> Result<PathBuf> {
    Ok(model_directory(app)?.join(format!("{MODEL_FILE_NAME}.verified")))
}

pub fn is_ready(app: &AppHandle<AppRuntime>) -> bool {
    let Ok(path) = model_path(app) else {
        return false;
    };
    let Ok(marker) = verified_marker_path(app) else {
        return false;
    };
    path.metadata()
        .map(|metadata| metadata.len() == MODEL_SIZE_BYTES)
        .unwrap_or(false)
        && marker.is_file()
}

pub fn spawn_download(app: AppHandle<AppRuntime>, model: String, token: CancellationToken) {
    tauri::async_runtime::spawn(async move {
        let result = download(&app, &model, token.clone()).await;
        let state = app.state::<AppState>();
        state.set_local_llm_verifying(false);
        state.clear_download_token(&download_key(&model));
        match result {
            Ok(DownloadOutcome::Complete) => {
                let _ = app.emit(EVENT_COMPLETE, DownloadResult { model });
            }
            Ok(DownloadOutcome::Cancelled) => {
                let _ = app.emit(EVENT_CANCELLED, DownloadResult { model });
            }
            Err(error) => {
                let _ = app.emit(
                    EVENT_ERROR,
                    DownloadFailure {
                        model,
                        error: error.to_string(),
                    },
                );
            }
        }
    });
}

enum DownloadOutcome {
    Complete,
    Cancelled,
}

async fn download(
    app: &AppHandle<AppRuntime>,
    model: &str,
    token: CancellationToken,
) -> Result<DownloadOutcome> {
    delete_retired_artifacts(app).await?;
    let directory = model_directory(app)?;
    tokio::fs::create_dir_all(&directory)
        .await
        .context("create local LLM model directory")?;
    let final_path = model_path(app)?;
    let partial_path = partial_path(app)?;
    let marker_path = verified_marker_path(app)?;

    let mut downloaded = tokio::fs::metadata(&partial_path)
        .await
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if downloaded > MODEL_SIZE_BYTES {
        tokio::fs::remove_file(&partial_path)
            .await
            .context("remove invalid partial model")?;
        downloaded = 0;
    }

    let available = fs2::available_space(&directory).context("check available disk space")?;
    let required = MODEL_SIZE_BYTES.saturating_sub(downloaded);
    if available < required {
        return Err(anyhow!(
            "Not enough disk space for the local meeting model ({} bytes required).",
            required
        ));
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .context("create local LLM download client")?;
    let mut request = client.get(MODEL_URL);
    if downloaded > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={downloaded}-"));
    }
    let response = request.send().await.context("download local LLM model")?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "Local model download failed with HTTP {}.",
            response.status()
        ));
    }

    let resumed = downloaded > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if downloaded > 0 && !resumed {
        downloaded = 0;
    }
    let mut options = tokio::fs::OpenOptions::new();
    options.create(true).write(true);
    if resumed {
        options.append(true);
    } else {
        options.truncate(true);
    }
    let mut file = options
        .open(&partial_path)
        .await
        .context("open partial local LLM model")?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = tokio::select! {
        _ = token.cancelled() => return Ok(DownloadOutcome::Cancelled),
        chunk = stream.next() => chunk,
    } {
        let chunk = chunk.context("read local LLM download")?;
        file.write_all(&chunk)
            .await
            .context("write partial local LLM model")?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        emit_progress(app, model, downloaded, false);
    }
    file.flush().await.context("flush local LLM model")?;
    drop(file);

    if downloaded != MODEL_SIZE_BYTES {
        return Err(anyhow!(
            "Local model size mismatch: expected {MODEL_SIZE_BYTES}, received {downloaded}."
        ));
    }
    emit_progress(app, model, downloaded, true);
    app.state::<AppState>().set_local_llm_verifying(true);
    if token.is_cancelled() {
        return Ok(DownloadOutcome::Cancelled);
    }
    if let Err(error) = verify_sha256(partial_path.clone()).await {
        let _ = tokio::fs::remove_file(&partial_path).await;
        return Err(error);
    }
    if token.is_cancelled() {
        return Ok(DownloadOutcome::Cancelled);
    }
    remove_if_exists(&final_path).await?;
    tokio::fs::rename(&partial_path, &final_path)
        .await
        .context("install verified local LLM model")?;
    tokio::fs::write(&marker_path, MODEL_SHA256)
        .await
        .context("write local LLM verification marker")?;
    Ok(DownloadOutcome::Complete)
}

async fn verify_sha256(path: PathBuf) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        use std::io::Read;

        let mut file = std::fs::File::open(&path).context("open local LLM for verification")?;
        let mut digest = Sha256::new();
        let mut buffer = [0_u8; 1024 * 1024];
        loop {
            let read = file.read(&mut buffer).context("hash local LLM model")?;
            if read == 0 {
                break;
            }
            digest.update(&buffer[..read]);
        }
        let actual = digest
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        if actual != MODEL_SHA256 {
            return Err(anyhow!(
                "Local model checksum mismatch. Retry the download."
            ));
        }
        Ok(())
    })
    .await
    .context("join local LLM verification task")?
}

fn emit_progress(app: &AppHandle<AppRuntime>, model: &str, downloaded: u64, verifying: bool) {
    let _ = app.emit(
        EVENT_PROGRESS,
        DownloadProgress {
            model: model.to_string(),
            downloaded,
            total: MODEL_SIZE_BYTES,
            percent: (downloaded as f64 / MODEL_SIZE_BYTES as f64 * 100.0).clamp(0.0, 100.0),
            verifying,
        },
    );
}

pub fn download_key(model: &str) -> String {
    format!("local-llm:{model}")
}

pub async fn delete_artifacts(app: &AppHandle<AppRuntime>) -> Result<()> {
    let directory = model_directory(app)?;
    remove_if_exists(&model_path(app)?).await?;
    remove_if_exists(&partial_path(app)?).await?;
    remove_if_exists(&verified_marker_path(app)?).await?;
    if directory.is_dir() {
        let _ = tokio::fs::remove_dir(&directory).await;
    }
    delete_retired_artifacts(app).await?;
    Ok(())
}

async fn delete_retired_artifacts(app: &AppHandle<AppRuntime>) -> Result<()> {
    let root = app
        .path()
        .app_data_dir()
        .context("resolve app data directory")?
        .join("models")
        .join("llm");
    for directory in RETIRED_MODEL_DIRECTORIES {
        let path = root.join(directory);
        match tokio::fs::remove_dir_all(&path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).with_context(|| format!("remove {}", path.display()));
            }
        }
    }
    Ok(())
}

async fn remove_if_exists(path: &Path) -> Result<()> {
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("remove {}", path.display())),
    }
}
