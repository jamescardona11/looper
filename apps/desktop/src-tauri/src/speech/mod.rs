pub mod catalog;
pub mod engine;
pub mod install;
pub mod menu;
pub mod remote;

use std::future::Future;
use std::path::Path;

use anyhow::{anyhow, Result};
use reqwest::Client;
use tauri::{AppHandle, Manager};

use crate::settings::{TranscriptionMode, UserSettings};
use crate::transcription_api::TranscriptionSuccess;
use crate::{AppRuntime, AppState};

pub use catalog::{list_models, SpeechModel};

/// Kept only to derive `MAX_CHUNK_MINUTES`, which needs a const. Each model's
/// effective chunking policy is owned by `speech::engine`.
pub const PARAKEET_CHUNK_SECONDS: u32 = 180;
pub const VAD_MIN_SPEECH_PERCENT_FILE: f32 = 2.0;
pub const VAD_MIN_SPEECH_PERCENT_CHUNK: f32 = 5.0;

const CLOUD_MODEL_KEY: &str = "cloud:looper";
const CANCELLED_MESSAGE: &str = "Transcription cancelled";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpeechRoute {
    Cloud,
    Remote,
    Local,
}

struct SpeechRouter<'a> {
    settings: &'a UserSettings,
}

impl<'a> SpeechRouter<'a> {
    fn new(settings: &'a UserSettings) -> Self {
        Self { settings }
    }

    fn selected_model(&self) -> String {
        if self.cloud_selected() {
            CLOUD_MODEL_KEY.to_string()
        } else if remote::is_configured(self.settings) {
            remote::speech_model_storage_label(self.settings, None)
        } else {
            self.settings.local_model.clone()
        }
    }

    fn route_for(&self, requested_model: &str) -> SpeechRoute {
        if self.cloud_selected() {
            SpeechRoute::Cloud
        } else if remote::is_remote_model(requested_model) && remote::is_configured(self.settings) {
            SpeechRoute::Remote
        } else {
            SpeechRoute::Local
        }
    }

    fn cloud_selected(&self) -> bool {
        self.settings.transcription_mode == TranscriptionMode::Cloud
    }
}

pub fn selected_model(settings: &UserSettings) -> String {
    SpeechRouter::new(settings).selected_model()
}

async fn between_cancellation_checkpoints<T>(
    is_cancelled: &impl Fn() -> bool,
    operation: impl Future<Output = Result<T>>,
) -> Result<T> {
    cancellation_checkpoint(is_cancelled)?;
    let value = operation.await?;
    cancellation_checkpoint(is_cancelled)?;
    Ok(value)
}

fn cancellation_checkpoint(is_cancelled: &impl Fn() -> bool) -> Result<()> {
    if is_cancelled() {
        Err(anyhow!(CANCELLED_MESSAGE))
    } else {
        Ok(())
    }
}

fn remote_options(wants_timestamps: bool) -> remote::TranscribeOptions {
    remote::TranscribeOptions {
        timestamps: wants_timestamps,
        diarization: false,
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn transcribe<T, LocalFuture>(
    app: &AppHandle<AppRuntime>,
    client: &Client,
    settings: &UserSettings,
    model_id: &str,
    wav_path: &Path,
    local_fallback_model: &str,
    wants_timestamps: bool,
    is_cancelled: impl Fn() -> bool,
    map_remote: impl FnOnce(TranscriptionSuccess) -> T,
    local: impl FnOnce() -> LocalFuture,
) -> Result<T>
where
    LocalFuture: Future<Output = Result<T>>,
{
    match SpeechRouter::new(settings).route_for(model_id) {
        SpeechRoute::Cloud => {
            transcribe_cloud(app, client, settings, wav_path, &is_cancelled, map_remote).await
        }
        SpeechRoute::Remote => {
            let attempt = remote::attempt_remote(
                app,
                client,
                settings,
                wav_path,
                local_fallback_model,
                remote_options(wants_timestamps),
                is_cancelled,
            )
            .await;
            resolve_remote_attempt(attempt, map_remote, local).await
        }
        SpeechRoute::Local => local().await,
    }
}

async fn transcribe_cloud<T>(
    app: &AppHandle<AppRuntime>,
    client: &Client,
    settings: &UserSettings,
    wav_path: &Path,
    is_cancelled: &impl Fn() -> bool,
    map_success: impl FnOnce(TranscriptionSuccess) -> T,
) -> Result<T> {
    let success = between_cancellation_checkpoints(is_cancelled, async {
        let token = app
            .state::<AppState>()
            .cloud_auth_token()
            .ok_or_else(|| anyhow!("Looper Cloud is still connecting. Try again in a moment."))?;
        crate::cloud_speech::transcribe(client, &token, wav_path, &settings.language).await
    })
    .await?;
    Ok(map_success(success))
}

async fn resolve_remote_attempt<T, LocalFuture>(
    attempt: remote::RemoteAttempt,
    map_success: impl FnOnce(TranscriptionSuccess) -> T,
    local: impl FnOnce() -> LocalFuture,
) -> Result<T>
where
    LocalFuture: Future<Output = Result<T>>,
{
    match attempt {
        remote::RemoteAttempt::Success(success) => Ok(map_success(success.transcription)),
        remote::RemoteAttempt::Fallback => local().await,
        remote::RemoteAttempt::Cancelled => Err(anyhow!(CANCELLED_MESSAGE)),
        remote::RemoteAttempt::Unavailable(message) => Err(anyhow!(message)),
    }
}

struct WarmRequest {
    model_key: String,
}

impl WarmRequest {
    fn from_settings(settings: &UserSettings) -> Option<Self> {
        let router = SpeechRouter::new(settings);
        let model_key = router.selected_model();
        (router.route_for(&model_key) == SpeechRoute::Local).then_some(Self { model_key })
    }
}

pub fn warm(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    let Some(request) = WarmRequest::from_settings(settings) else {
        return;
    };

    let app_handle = app.clone();
    std::thread::spawn(move || warm_local_model(app_handle, request));
}

fn warm_local_model(app: AppHandle<AppRuntime>, request: WarmRequest) {
    let ready = match install::ensure_model_ready(&app, &request.model_key) {
        Ok(model) => model,
        Err(error) => {
            tracing::error!("[speech] skipping warm: {error}");
            return;
        }
    };
    let transcriber = app.state::<AppState>().local_transcriber();
    if let Err(error) = transcriber.preload_and_warm_if_needed(&ready) {
        tracing::error!("[speech] warm failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    fn local_settings() -> UserSettings {
        UserSettings {
            transcription_mode: TranscriptionMode::Local,
            local_model: "parakeet-local".to_string(),
            ..Default::default()
        }
    }

    fn configured_remote_settings() -> UserSettings {
        UserSettings {
            remote_speech_enabled: true,
            remote_speech_provider: "custom".to_string(),
            remote_speech_endpoint: "https://speech.example.test/v1".to_string(),
            remote_speech_model: "remote-model".to_string(),
            ..local_settings()
        }
    }

    #[test]
    fn selected_model_prioritizes_cloud_then_remote_then_local() {
        let mut settings = configured_remote_settings();
        assert_eq!(selected_model(&settings), "remote:custom:remote-model");

        settings.transcription_mode = TranscriptionMode::Cloud;
        assert_eq!(selected_model(&settings), CLOUD_MODEL_KEY);

        settings = local_settings();
        assert_eq!(selected_model(&settings), "parakeet-local");
    }

    #[test]
    fn router_requires_remote_identifier_and_valid_configuration() {
        let configured = configured_remote_settings();
        let router = SpeechRouter::new(&configured);
        assert_eq!(
            router.route_for("remote:custom:remote-model"),
            SpeechRoute::Remote
        );
        assert_eq!(router.route_for("parakeet-local"), SpeechRoute::Local);

        let unconfigured = local_settings();
        assert_eq!(
            SpeechRouter::new(&unconfigured).route_for("remote:custom:remote-model"),
            SpeechRoute::Local
        );
    }

    #[tokio::test]
    async fn cloud_checkpoint_stops_before_starting_the_operation() {
        let operation_polled = Cell::new(false);
        let error = between_cancellation_checkpoints(&|| true, async {
            operation_polled.set(true);
            Ok::<_, anyhow::Error>("cloud result")
        })
        .await
        .unwrap_err();

        assert!(!operation_polled.get());
        assert_eq!(error.to_string(), CANCELLED_MESSAGE);
    }

    #[tokio::test]
    async fn cloud_checkpoint_discards_a_result_cancelled_during_request() {
        let checks = Cell::new(0usize);
        let cancellation = || {
            let current = checks.get();
            checks.set(current + 1);
            current == 1
        };
        let error = between_cancellation_checkpoints(&cancellation, async {
            Ok::<_, anyhow::Error>("completed response")
        })
        .await
        .unwrap_err();

        assert_eq!(checks.get(), 2);
        assert_eq!(error.to_string(), CANCELLED_MESSAGE);
    }

    #[test]
    fn remote_options_forward_timestamps_and_never_request_diarization() {
        let with_timestamps = remote_options(true);
        assert!(with_timestamps.timestamps);
        assert!(!with_timestamps.diarization);

        let without_timestamps = remote_options(false);
        assert!(!without_timestamps.timestamps);
        assert!(!without_timestamps.diarization);
    }

    #[tokio::test]
    async fn remote_success_preserves_timed_segments_for_the_mapper() {
        let success = TranscriptionSuccess {
            transcript: "timed transcript".to_string(),
            speech_model: Some("remote:custom:model".to_string()),
            segments: Some(vec![looper_ts::TimedSegment {
                start: 0.25,
                end: 1.5,
                text: "timed transcript".to_string(),
            }]),
            words: None,
        };
        let attempt = remote::RemoteAttempt::Success(remote::RemoteTranscriptionSuccess {
            transcription: success,
            diarized_segments: None,
        });

        let mapped = resolve_remote_attempt(
            attempt,
            |success| {
                let segment = &success.segments.unwrap()[0];
                (success.transcript, segment.start, segment.end)
            },
            || async { panic!("local fallback must not run") },
        )
        .await
        .unwrap();
        assert_eq!(mapped, ("timed transcript".to_string(), 0.25, 1.5));
    }

    #[tokio::test]
    async fn remote_fallback_cancel_and_unavailable_keep_outcomes() {
        let fallback = resolve_remote_attempt(
            remote::RemoteAttempt::Fallback,
            |_| "remote",
            || async { Ok("local") },
        )
        .await
        .unwrap();
        assert_eq!(fallback, "local");

        let cancelled = resolve_remote_attempt(
            remote::RemoteAttempt::Cancelled,
            |_| "remote",
            || async { Ok("local") },
        )
        .await
        .unwrap_err();
        assert_eq!(cancelled.to_string(), CANCELLED_MESSAGE);

        let unavailable = resolve_remote_attempt(
            remote::RemoteAttempt::Unavailable("No local fallback".to_string()),
            |_| "remote",
            || async { Ok("local") },
        )
        .await
        .unwrap_err();
        assert_eq!(unavailable.to_string(), "No local fallback");
    }

    #[test]
    fn warm_request_exists_only_for_the_local_route() {
        assert_eq!(
            WarmRequest::from_settings(&local_settings())
                .unwrap()
                .model_key,
            "parakeet-local"
        );
        assert!(WarmRequest::from_settings(&configured_remote_settings()).is_none());

        let mut cloud = local_settings();
        cloud.transcription_mode = TranscriptionMode::Cloud;
        assert!(WarmRequest::from_settings(&cloud).is_none());
    }
}
