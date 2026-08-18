use std::{collections::HashMap, path::Path, sync::OnceLock, time::Duration};

use rand::RngExt;
use reqwest::Client;
use tauri::AppHandle;

use crate::{
    model_manager,
    remote_api::{self, DiarizedSegment, RemoteError, RemoteErrorKind, RemoteRequestParams},
    settings::UserSettings,
    toast,
    transcription_api::{normalize_transcript, TranscriptionSuccess},
    AppRuntime,
};

const REMOTE_SPEECH_DEFAULT_MODELS_JSON: &str =
    include_str!("../../../src/shared/lib/remote-speech-defaults.json");
const RETRY_DELAYS_MS: [u64; 2] = [0, 300];
const RETRY_JITTER_MAX_MS: u64 = 100;
const INVALID_REQUEST_DETAIL_LIMIT: usize = 160;

pub(crate) const SPEECH_MODEL_REMOTE_PREFIX: &str = "remote:";

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderId(String);

impl ProviderId {
    fn parse(value: &str) -> Self {
        Self(value.trim().to_ascii_lowercase())
    }

    fn default_model(&self) -> Option<String> {
        provider_defaults().get(&self.0).cloned()
    }

    fn requires_key(&self) -> bool {
        matches!(
            self.0.as_str(),
            "openai" | "groq" | "mistral" | "fireworks" | "openrouter" | "deepgram" | "elevenlabs"
        )
    }
}

fn provider_defaults() -> &'static HashMap<String, String> {
    static DEFAULTS: OnceLock<HashMap<String, String>> = OnceLock::new();
    DEFAULTS.get_or_init(|| {
        serde_json::from_str(REMOTE_SPEECH_DEFAULT_MODELS_JSON)
            .expect("Desktop remote speech default model configuration must be valid JSON")
    })
}

struct RemoteConfiguration<'a> {
    settings: &'a UserSettings,
}

impl<'a> RemoteConfiguration<'a> {
    fn new(settings: &'a UserSettings) -> Self {
        Self { settings }
    }

    fn endpoint(&self) -> &'a str {
        self.settings.remote_speech_endpoint.trim()
    }

    fn model(&self) -> Option<String> {
        resolve_model(
            &self.settings.remote_speech_provider,
            &self.settings.remote_speech_model,
        )
    }

    fn missing_fields(&self) -> Vec<MissingConfiguration> {
        let mut fields = Vec::with_capacity(3);
        if self.endpoint().is_empty() {
            fields.push(MissingConfiguration::Endpoint);
        }
        if self.model().is_none() {
            fields.push(MissingConfiguration::Model);
        }
        if ProviderId::parse(&self.settings.remote_speech_provider).requires_key()
            && self.settings.remote_speech_api_key.trim().is_empty()
        {
            fields.push(MissingConfiguration::ApiKey);
        }
        fields
    }

    fn is_valid(&self) -> bool {
        self.missing_fields().is_empty()
    }

    fn is_enabled(&self) -> bool {
        self.settings.remote_speech_enabled && self.is_valid()
    }

    fn storage_label(&self, model_used: Option<&str>) -> String {
        let provider = self.settings.remote_speech_provider.trim();
        let selected = model_used
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .map(str::to_owned)
            .or_else(|| self.model())
            .unwrap_or_default();
        match selected.is_empty() {
            true => format!("{SPEECH_MODEL_REMOTE_PREFIX}{provider}"),
            false => format!("{SPEECH_MODEL_REMOTE_PREFIX}{provider}:{selected}"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MissingConfiguration {
    Endpoint,
    Model,
    ApiKey,
}

impl MissingConfiguration {
    fn description(self) -> &'static str {
        match self {
            Self::Endpoint => "an endpoint",
            Self::Model => "a model",
            Self::ApiKey => "an API key",
        }
    }
}

fn describe_missing_configuration(fields: &[MissingConfiguration]) -> String {
    let descriptions = fields
        .iter()
        .map(|field| field.description())
        .collect::<Vec<_>>();
    match descriptions.as_slice() {
        [] => "the required settings".to_owned(),
        [only] => (*only).to_owned(),
        [first, second] => format!("{first} and {second}"),
        [leading @ .., last] => format!("{}, and {last}", leading.join(", ")),
    }
}

pub(crate) fn has_valid_config(settings: &UserSettings) -> bool {
    RemoteConfiguration::new(settings).is_valid()
}

pub(crate) fn is_configured(settings: &UserSettings) -> bool {
    RemoteConfiguration::new(settings).is_enabled()
}

pub(crate) fn resolved_endpoint(settings: &UserSettings) -> String {
    RemoteConfiguration::new(settings).endpoint().to_owned()
}

pub(crate) fn provider_default_model(provider: &str) -> Option<String> {
    ProviderId::parse(provider).default_model()
}

pub(crate) fn provider_requires_api_key(provider: &str) -> bool {
    ProviderId::parse(provider).requires_key()
}

pub(crate) fn resolve_model(provider: &str, model: &str) -> Option<String> {
    let requested = model.trim();
    if !requested.is_empty() && !requested.eq_ignore_ascii_case("auto") {
        return Some(requested.to_owned());
    }
    ProviderId::parse(provider).default_model()
}

pub(crate) fn resolved_model_name(settings: &UserSettings) -> Option<String> {
    RemoteConfiguration::new(settings).model()
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct TranscribeOptions {
    pub timestamps: bool,
    pub diarization: bool,
}

struct RemoteRequestPlan {
    endpoint: String,
    api_key: String,
    model: String,
    language: Option<String>,
    dictionary: Vec<String>,
    options: TranscribeOptions,
}

impl RemoteRequestPlan {
    fn from_settings(settings: &UserSettings, options: TranscribeOptions) -> Self {
        let configuration = RemoteConfiguration::new(settings);
        Self {
            endpoint: configuration.endpoint().to_owned(),
            api_key: settings.remote_speech_api_key.clone(),
            model: configuration.model().unwrap_or_default(),
            language: Self::non_empty(settings.language.trim()),
            dictionary: settings
                .dictionary
                .iter()
                .filter_map(|term| Self::non_empty(term.trim()))
                .collect(),
            options,
        }
    }

    fn non_empty(value: &str) -> Option<String> {
        (!value.is_empty()).then(|| value.to_owned())
    }

    fn params(&self) -> RemoteRequestParams<'_> {
        RemoteRequestParams {
            model: &self.model,
            language: self.language.as_deref(),
            dictionary: &self.dictionary,
            prompt: None,
            timestamps: self.options.timestamps,
        }
    }
}

pub(crate) async fn transcribe_file(
    client: &Client,
    wav_path: &Path,
    settings: &UserSettings,
    options: TranscribeOptions,
) -> Result<RemoteTranscriptionSuccess, RemoteError> {
    let plan = RemoteRequestPlan::from_settings(settings, options);
    let response = remote_api::transcribe_file(
        client,
        &plan.endpoint,
        &plan.api_key,
        wav_path,
        plan.params(),
        plan.options.diarization,
    )
    .await?;
    Ok(complete_transcription(settings, response))
}

fn complete_transcription(
    settings: &UserSettings,
    response: remote_api::DiarizedTranscription,
) -> RemoteTranscriptionSuccess {
    let remote_api::DiarizedTranscription {
        transcription,
        segments: diarized_segments,
    } = response;
    RemoteTranscriptionSuccess {
        transcription: TranscriptionSuccess {
            transcript: normalize_transcript(&transcription.text),
            speech_model: Some(
                RemoteConfiguration::new(settings).storage_label(Some(&transcription.model_id)),
            ),
            segments: convert_segments(transcription.segments),
            words: convert_segments(transcription.words),
        },
        diarized_segments,
    }
}

fn convert_segments(
    source: Option<Vec<remote_api::TranscriptionSegment>>,
) -> Option<Vec<looper_ts::TimedSegment>> {
    source.map(|segments| {
        segments
            .into_iter()
            .map(|segment| looper_ts::TimedSegment {
                start: segment.start,
                end: segment.end,
                text: segment.text,
            })
            .collect()
    })
}

pub(crate) struct RemoteTranscriptionSuccess {
    pub transcription: TranscriptionSuccess,
    pub diarized_segments: Option<Vec<DiarizedSegment>>,
}

pub(crate) enum RemoteAttempt {
    Success(RemoteTranscriptionSuccess),
    Cancelled,
    Fallback,
    Unavailable(String),
}

struct RetryPolicy {
    delays_ms: &'static [u64],
}

const REMOTE_RETRY_POLICY: RetryPolicy = RetryPolicy {
    delays_ms: &RETRY_DELAYS_MS,
};

impl RetryPolicy {
    fn is_transient(kind: RemoteErrorKind) -> bool {
        matches!(
            kind,
            RemoteErrorKind::UpstreamUnavailable | RemoteErrorKind::Other
        )
    }

    fn permits_retry(&self, kind: RemoteErrorKind, attempt: usize) -> bool {
        Self::is_transient(kind) && attempt + 1 < self.delays_ms.len()
    }

    fn randomized_delay(base_ms: u64) -> Duration {
        if base_ms == 0 {
            return Duration::ZERO;
        }
        let jitter = rand::rng().random_range(0..=RETRY_JITTER_MAX_MS);
        Duration::from_millis(base_ms + jitter)
    }
}

enum RetryOutcome {
    Cancelled,
    Failed(RemoteError),
}

async fn transcribe_with_retry(
    client: &Client,
    wav_path: &Path,
    settings: &UserSettings,
    options: TranscribeOptions,
    is_cancelled: &impl Fn() -> bool,
) -> Result<RemoteTranscriptionSuccess, RetryOutcome> {
    for (attempt, delay_ms) in REMOTE_RETRY_POLICY.delays_ms.iter().copied().enumerate() {
        if attempt != 0 {
            tokio::time::sleep(RetryPolicy::randomized_delay(delay_ms)).await;
        }
        if is_cancelled() {
            return Err(RetryOutcome::Cancelled);
        }
        match transcribe_file(client, wav_path, settings, options).await {
            Ok(success) => return Ok(success),
            Err(error) if REMOTE_RETRY_POLICY.permits_retry(error.kind, attempt) => {
                tracing::warn!(
                    "Remote speech attempt {} failed transiently, retrying: {error}",
                    attempt + 1
                );
            }
            Err(error) => return Err(RetryOutcome::Failed(error)),
        }
    }
    unreachable!("remote retry policy always returns from its final attempt")
}

struct FallbackCoordinator<'a> {
    app: &'a AppHandle<AppRuntime>,
    settings: &'a UserSettings,
    preferred_local: &'a str,
}

impl FallbackCoordinator<'_> {
    fn resolve(self, error: &RemoteError) -> RemoteAttempt {
        let remote_model = speech_model_storage_label(self.settings, None);
        let reason = remote_error_reason(error);
        match model_manager::ensure_local_fallback_model(self.app, self.preferred_local) {
            Ok(ready) => {
                let local_model = model_manager::model_label(&ready.key);
                self.track(&remote_model, &local_model, reason, "used");
                emit_fallback_toast(self.app, error);
                RemoteAttempt::Fallback
            }
            Err(_) => {
                let local_model = model_manager::model_label(self.preferred_local);
                self.track(&remote_model, &local_model, reason, "unavailable");
                let message = fallback_unavailable_toast_message(error);
                emit_fallback_unavailable_toast_message(self.app, &message);
                RemoteAttempt::Unavailable(message)
            }
        }
    }

    fn track(&self, remote_model: &str, local_model: &str, reason: &str, outcome: &str) {
        crate::analytics::track_transcription_fallback(
            self.app,
            remote_model,
            local_model,
            reason,
            outcome,
        );
    }
}

pub(crate) async fn attempt_remote(
    app: &AppHandle<AppRuntime>,
    client: &Client,
    settings: &UserSettings,
    wav_path: &Path,
    local_fallback_model: &str,
    options: TranscribeOptions,
    is_cancelled: impl Fn() -> bool,
) -> RemoteAttempt {
    let failure =
        match transcribe_with_retry(client, wav_path, settings, options, &is_cancelled).await {
            Ok(success) => return RemoteAttempt::Success(success),
            Err(RetryOutcome::Cancelled) => return RemoteAttempt::Cancelled,
            Err(RetryOutcome::Failed(error)) => error,
        };
    tracing::error!("Remote speech failed, falling back to local model: {failure}");
    FallbackCoordinator {
        app,
        settings,
        preferred_local: local_fallback_model,
    }
    .resolve(&failure)
}

trait RemoteErrorPresentation {
    fn analytics_reason(&self) -> &'static str;
    fn issue_message(&self) -> String;
}

impl RemoteErrorPresentation for RemoteError {
    fn analytics_reason(&self) -> &'static str {
        match self.kind {
            RemoteErrorKind::RateLimited => "rate_limited",
            RemoteErrorKind::QuotaExceeded => "quota_exceeded",
            RemoteErrorKind::Unauthorized => "unauthorized",
            RemoteErrorKind::InvalidRequest => "invalid_request",
            RemoteErrorKind::NotFound => "not_found",
            RemoteErrorKind::UpstreamUnavailable => "upstream_unavailable",
            RemoteErrorKind::Other => "unknown",
        }
    }

    fn issue_message(&self) -> String {
        match self.kind {
            RemoteErrorKind::RateLimited => match self.retry_after {
                Some(retry_after) => {
                    let seconds = retry_after.as_secs().max(1);
                    let suffix = if seconds == 1 { "" } else { "s" };
                    format!(
                        "Speech provider rate limit reached (retry in about {seconds} second{suffix})."
                    )
                }
                None => "Speech provider rate limit reached.".to_owned(),
            },
            RemoteErrorKind::QuotaExceeded => "Speech provider quota exceeded.".to_owned(),
            RemoteErrorKind::Unauthorized => {
                "Speech provider API key is invalid or expired.".to_owned()
            }
            RemoteErrorKind::InvalidRequest => invalid_request_message(&self.message),
            RemoteErrorKind::NotFound => {
                "Speech provider endpoint or model was not found.".to_owned()
            }
            RemoteErrorKind::UpstreamUnavailable | RemoteErrorKind::Other => {
                "Speech provider unreachable.".to_owned()
            }
        }
    }
}

fn invalid_request_message(message: &str) -> String {
    let detail = message.trim();
    if detail.is_empty() {
        return "Speech provider rejected the request.".to_owned();
    }
    let mut snippet = detail
        .chars()
        .take(INVALID_REQUEST_DETAIL_LIMIT)
        .collect::<String>();
    if detail.chars().count() > INVALID_REQUEST_DETAIL_LIMIT {
        snippet.push('…');
    }
    format!("Speech provider rejected the request: {snippet}")
}

fn remote_error_reason(error: &RemoteError) -> &'static str {
    error.analytics_reason()
}

fn remote_issue_message(error: &RemoteError) -> String {
    error.issue_message()
}

pub(crate) fn is_remote_model(value: &str) -> bool {
    value.trim().starts_with(SPEECH_MODEL_REMOTE_PREFIX)
}

pub(crate) fn speech_model_storage_label(
    settings: &UserSettings,
    model_used: Option<&str>,
) -> String {
    RemoteConfiguration::new(settings).storage_label(model_used)
}

pub(crate) fn fallback_toast_message(error: &RemoteError) -> String {
    format!("{} Defaulting to local model.", remote_issue_message(error))
}

pub(crate) fn fallback_unavailable_toast_message(error: &RemoteError) -> String {
    format!(
        "{} No local model is installed for fallback.",
        remote_issue_message(error)
    )
}

pub(crate) fn is_fallback_unavailable_message(message: &str) -> bool {
    message.contains("No local model is installed for fallback.")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderNoticeLevel {
    Warning,
    Error,
}

struct ProviderNotice {
    level: ProviderNoticeLevel,
    message: String,
}

impl ProviderNotice {
    fn warning(message: String) -> Self {
        Self {
            level: ProviderNoticeLevel::Warning,
            message,
        }
    }

    fn error(message: String) -> Self {
        Self {
            level: ProviderNoticeLevel::Error,
            message,
        }
    }

    fn payload(self) -> toast::Payload {
        toast::Payload {
            toast_type: match self.level {
                ProviderNoticeLevel::Warning => "warning",
                ProviderNoticeLevel::Error => "error",
            }
            .to_owned(),
            title: Some("Speech Provider".to_owned()),
            message: self.message,
            auto_dismiss: Some(true),
            duration: None,
            retry_id: None,
            mode: None,
            action: None,
            action_label: None,
            secondary_action: None,
            secondary_action_label: None,
        }
    }

    fn emit(self, app: &AppHandle<AppRuntime>) {
        toast::emit_toast(app, self.payload());
    }
}

pub(crate) fn emit_fallback_toast(app: &AppHandle<AppRuntime>, error: &RemoteError) {
    ProviderNotice::warning(fallback_toast_message(error)).emit(app);
}

pub(crate) fn emit_not_configured_toast(app: &AppHandle<AppRuntime>, settings: &UserSettings) {
    let missing = RemoteConfiguration::new(settings).missing_fields();
    let needed = describe_missing_configuration(&missing);
    ProviderNotice::warning(format!(
        "Add {needed} in Settings before enabling a remote speech provider."
    ))
    .emit(app);
}

fn emit_fallback_unavailable_toast_message(app: &AppHandle<AppRuntime>, message: &str) {
    ProviderNotice::error(message.to_owned()).emit(app);
}

#[cfg(test)]
#[path = "remote_contract_tests.rs"]
mod contract_tests;
