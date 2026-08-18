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
mod contract_tests {
    use std::time::Duration;

    use serde_json::{json, Value};

    use super::*;

    fn settings(provider: &str, endpoint: &str, model: &str, key: &str) -> UserSettings {
        UserSettings {
            remote_speech_enabled: true,
            remote_speech_provider: provider.to_owned(),
            remote_speech_endpoint: endpoint.to_owned(),
            remote_speech_model: model.to_owned(),
            remote_speech_api_key: key.to_owned(),
            language: " en ".to_owned(),
            dictionary: vec![" Looper ".to_owned(), "".to_owned(), " Voxtral".to_owned()],
            ..UserSettings::default()
        }
    }

    fn error(kind: RemoteErrorKind, message: &str, retry_after: Option<Duration>) -> RemoteError {
        RemoteError {
            kind,
            status: 0,
            message: message.to_owned(),
            error_type: None,
            code: None,
            param: None,
            retry_after,
        }
    }

    fn response() -> remote_api::DiarizedTranscription {
        remote_api::DiarizedTranscription {
            transcription: remote_api::Transcription {
                text: "  hello\t world  ".to_owned(),
                model_id: "provider-model".to_owned(),
                language: Some("en".to_owned()),
                duration_ms: 2_000,
                segments: Some(vec![remote_api::TranscriptionSegment {
                    start: 0.0,
                    end: 2.0,
                    text: "hello world".to_owned(),
                }]),
                words: Some(vec![remote_api::TranscriptionSegment {
                    start: 0.0,
                    end: 0.5,
                    text: "hello".to_owned(),
                }]),
            },
            segments: Some(vec![DiarizedSegment {
                start: 0.0,
                end: 2.0,
                text: "hello world".to_owned(),
                speaker: Some("speaker_0".to_owned()),
            }]),
        }
    }

    #[test]
    fn provider_defaults_are_loaded_from_the_shared_contract() {
        let cases = [
            ("openai", "gpt-4o-mini-transcribe"),
            (" GROQ ", "whisper-large-v3-turbo"),
            ("mistral", "voxtral-mini-latest"),
            ("fireworks", "whisper-v3"),
            ("openrouter", "openai/whisper-1"),
            ("deepgram", "nova-3"),
            ("elevenlabs", "scribe_v1"),
        ];
        for (provider, expected) in cases {
            assert_eq!(provider_default_model(provider).as_deref(), Some(expected));
        }
        assert_eq!(provider_default_model("custom"), None);
    }

    #[test]
    fn explicit_model_overrides_auto_and_is_trimmed() {
        assert_eq!(
            resolve_model("openai", "  whisper-1 ").as_deref(),
            Some("whisper-1")
        );
        assert_eq!(
            resolve_model("groq", " AUTO ").as_deref(),
            Some("whisper-large-v3-turbo")
        );
        assert_eq!(resolve_model("unknown", "auto"), None);
    }

    #[test]
    fn only_hosted_providers_require_api_keys() {
        for provider in [
            "openai",
            "groq",
            "mistral",
            "fireworks",
            "openrouter",
            "deepgram",
            "elevenlabs",
        ] {
            assert!(provider_requires_api_key(provider));
        }
        for provider in ["custom", "localai", "whisper-cpp", ""] {
            assert!(!provider_requires_api_key(provider));
        }
    }

    #[test]
    fn configuration_requires_endpoint_model_and_provider_key() {
        let complete = settings("openai", " https://api.openai.com/v1 ", "auto", "secret");
        assert!(has_valid_config(&complete));
        assert!(is_configured(&complete));
        assert_eq!(resolved_endpoint(&complete), "https://api.openai.com/v1");

        let mut disabled = complete.clone();
        disabled.remote_speech_enabled = false;
        assert!(has_valid_config(&disabled));
        assert!(!is_configured(&disabled));
    }

    #[test]
    fn custom_provider_can_be_valid_without_api_key() {
        let custom = settings(
            "custom",
            "https://speech.example.test/v1",
            "custom-model",
            "",
        );
        assert!(has_valid_config(&custom));
    }

    #[test]
    fn missing_configuration_keeps_human_readable_order_and_grammar() {
        assert_eq!(describe_missing_configuration(&[]), "the required settings");
        assert_eq!(
            describe_missing_configuration(&[MissingConfiguration::Endpoint]),
            "an endpoint"
        );
        assert_eq!(
            describe_missing_configuration(&[
                MissingConfiguration::Endpoint,
                MissingConfiguration::Model,
            ]),
            "an endpoint and a model"
        );
        assert_eq!(
            describe_missing_configuration(&[
                MissingConfiguration::Endpoint,
                MissingConfiguration::Model,
                MissingConfiguration::ApiKey,
            ]),
            "an endpoint, a model, and an API key"
        );
    }

    #[test]
    fn configuration_audit_accounts_for_provider_defaults() {
        let incomplete = settings("openai", " ", " ", " ");
        assert_eq!(
            RemoteConfiguration::new(&incomplete).missing_fields(),
            vec![MissingConfiguration::Endpoint, MissingConfiguration::ApiKey]
        );
        assert!(!has_valid_config(&incomplete));

        let custom = settings("custom", " ", " ", " ");
        assert_eq!(
            RemoteConfiguration::new(&custom).missing_fields(),
            vec![MissingConfiguration::Endpoint, MissingConfiguration::Model]
        );
        assert!(!has_valid_config(&custom));
    }

    #[test]
    fn request_plan_trims_context_without_reordering_dictionary() {
        let configured = settings(
            "mistral",
            " https://api.mistral.ai/v1 ",
            "auto",
            " raw-secret ",
        );
        let plan = RemoteRequestPlan::from_settings(
            &configured,
            TranscribeOptions {
                timestamps: true,
                diarization: true,
            },
        );
        assert_eq!(plan.endpoint, "https://api.mistral.ai/v1");
        assert_eq!(plan.api_key, " raw-secret ");
        assert_eq!(plan.model, "voxtral-mini-latest");
        assert_eq!(plan.language.as_deref(), Some("en"));
        assert_eq!(plan.dictionary, vec!["Looper", "Voxtral"]);
        assert_eq!(
            plan.options,
            TranscribeOptions {
                timestamps: true,
                diarization: true
            }
        );
        let params = plan.params();
        assert!(params.timestamps);
        assert_eq!(params.prompt, None);
    }

    #[test]
    fn empty_language_and_dictionary_entries_are_omitted() {
        let mut configured = settings("custom", "https://speech.example.test", "model", "");
        configured.language = " ".to_owned();
        configured.dictionary = vec![" ".to_owned(), "Term".to_owned()];
        let plan = RemoteRequestPlan::from_settings(&configured, TranscribeOptions::default());
        assert_eq!(plan.language, None);
        assert_eq!(plan.dictionary, vec!["Term"]);
    }

    #[test]
    fn response_mapping_normalizes_text_and_preserves_timing_and_diarization() {
        let configured = settings("openai", "https://api.openai.com/v1", "whisper-1", "secret");
        let completed = complete_transcription(&configured, response());
        assert_eq!(completed.transcription.transcript, "hello world");
        assert_eq!(
            completed.transcription.speech_model.as_deref(),
            Some("remote:openai:provider-model")
        );
        let segment = &completed.transcription.segments.as_ref().unwrap()[0];
        assert_eq!(
            (segment.start, segment.end, segment.text.as_str()),
            (0.0, 2.0, "hello world")
        );
        let word = &completed.transcription.words.as_ref().unwrap()[0];
        assert_eq!(
            (word.start, word.end, word.text.as_str()),
            (0.0, 0.5, "hello")
        );
        assert_eq!(
            completed.diarized_segments.as_ref().unwrap()[0]
                .speaker
                .as_deref(),
            Some("speaker_0")
        );
    }

    #[test]
    fn absent_segment_collections_remain_absent() {
        assert_eq!(convert_segments(None), None);
        assert_eq!(convert_segments(Some(Vec::new())), Some(Vec::new()));
    }

    #[test]
    fn storage_labels_prefer_actual_provider_model_then_resolved_default() {
        let configured = settings(" groq ", "https://api.groq.com/openai/v1", "auto", "secret");
        assert_eq!(
            speech_model_storage_label(&configured, Some(" actual-model ")),
            "remote:groq:actual-model"
        );
        assert_eq!(
            speech_model_storage_label(&configured, Some(" ")),
            "remote:groq:whisper-large-v3-turbo"
        );

        let unresolved = settings("custom", "https://custom.test", "auto", "");
        assert_eq!(
            speech_model_storage_label(&unresolved, None),
            "remote:custom"
        );
    }

    #[test]
    fn remote_model_detection_trims_outer_whitespace_only() {
        assert!(is_remote_model("  remote:openai:model "));
        assert!(is_remote_model("remote:"));
        assert!(!is_remote_model("Remote:openai:model"));
        assert!(!is_remote_model("local:remote:model"));
    }

    #[test]
    fn retry_policy_allows_one_extra_attempt_only_for_transient_failures() {
        for kind in [RemoteErrorKind::UpstreamUnavailable, RemoteErrorKind::Other] {
            assert!(RetryPolicy::is_transient(kind));
            assert!(REMOTE_RETRY_POLICY.permits_retry(kind, 0));
            assert!(!REMOTE_RETRY_POLICY.permits_retry(kind, 1));
        }
        for kind in [
            RemoteErrorKind::RateLimited,
            RemoteErrorKind::QuotaExceeded,
            RemoteErrorKind::Unauthorized,
            RemoteErrorKind::InvalidRequest,
            RemoteErrorKind::NotFound,
        ] {
            assert!(!RetryPolicy::is_transient(kind));
            assert!(!REMOTE_RETRY_POLICY.permits_retry(kind, 0));
        }
        assert_eq!(RETRY_DELAYS_MS, [0, 300]);
    }

    #[test]
    fn retry_jitter_stays_within_the_failover_budget() {
        assert_eq!(RetryPolicy::randomized_delay(0), Duration::ZERO);
        for _ in 0..64 {
            let delay = RetryPolicy::randomized_delay(300);
            assert!((Duration::from_millis(300)..=Duration::from_millis(400)).contains(&delay));
        }
    }

    #[test]
    fn analytics_reason_is_stable_for_every_error_kind() {
        let cases = [
            (RemoteErrorKind::RateLimited, "rate_limited"),
            (RemoteErrorKind::QuotaExceeded, "quota_exceeded"),
            (RemoteErrorKind::Unauthorized, "unauthorized"),
            (RemoteErrorKind::InvalidRequest, "invalid_request"),
            (RemoteErrorKind::NotFound, "not_found"),
            (RemoteErrorKind::UpstreamUnavailable, "upstream_unavailable"),
            (RemoteErrorKind::Other, "unknown"),
        ];
        for (kind, expected) in cases {
            assert_eq!(remote_error_reason(&error(kind, "", None)), expected);
        }
    }

    #[test]
    fn issue_messages_cover_permanent_and_transient_failures() {
        let cases = [
            (
                RemoteErrorKind::QuotaExceeded,
                "Speech provider quota exceeded.",
            ),
            (
                RemoteErrorKind::Unauthorized,
                "Speech provider API key is invalid or expired.",
            ),
            (
                RemoteErrorKind::InvalidRequest,
                "Speech provider rejected the request.",
            ),
            (
                RemoteErrorKind::NotFound,
                "Speech provider endpoint or model was not found.",
            ),
            (
                RemoteErrorKind::UpstreamUnavailable,
                "Speech provider unreachable.",
            ),
            (RemoteErrorKind::Other, "Speech provider unreachable."),
        ];
        for (kind, expected) in cases {
            assert_eq!(remote_issue_message(&error(kind, "", None)), expected);
        }
    }

    #[test]
    fn rate_limit_message_uses_bounded_singular_and_plural_seconds() {
        assert_eq!(
            remote_issue_message(&error(
                RemoteErrorKind::RateLimited,
                "",
                Some(Duration::ZERO)
            )),
            "Speech provider rate limit reached (retry in about 1 second)."
        );
        assert_eq!(
            remote_issue_message(&error(
                RemoteErrorKind::RateLimited,
                "",
                Some(Duration::from_secs(3))
            )),
            "Speech provider rate limit reached (retry in about 3 seconds)."
        );
        assert_eq!(
            remote_issue_message(&error(RemoteErrorKind::RateLimited, "", None)),
            "Speech provider rate limit reached."
        );
    }

    #[test]
    fn invalid_request_detail_is_trimmed_and_truncated_by_unicode_character() {
        assert_eq!(
            remote_issue_message(&error(
                RemoteErrorKind::InvalidRequest,
                "  invalid language  ",
                None
            )),
            "Speech provider rejected the request: invalid language"
        );
        let long = "é".repeat(INVALID_REQUEST_DETAIL_LIMIT + 1);
        let message = remote_issue_message(&error(RemoteErrorKind::InvalidRequest, &long, None));
        assert_eq!(
            message
                .chars()
                .filter(|character| *character == 'é')
                .count(),
            160
        );
        assert!(message.ends_with('…'));
    }

    #[test]
    fn fallback_messages_distinguish_used_and_unavailable_local_model() {
        let failure = error(RemoteErrorKind::Unauthorized, "", None);
        assert_eq!(
            fallback_toast_message(&failure),
            "Speech provider API key is invalid or expired. Defaulting to local model."
        );
        let unavailable = fallback_unavailable_toast_message(&failure);
        assert_eq!(
            unavailable,
            "Speech provider API key is invalid or expired. No local model is installed for fallback."
        );
        assert!(is_fallback_unavailable_message(&unavailable));
        assert!(!is_fallback_unavailable_message(
            "Defaulting to local model."
        ));
    }

    #[test]
    fn provider_notice_payload_preserves_frontend_wire_contract() {
        let payload = ProviderNotice::warning("Try local".to_owned()).payload();
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            json!({
                "type": "warning",
                "title": "Speech Provider",
                "message": "Try local",
                "autoDismiss": true,
                "duration": null,
                "retryId": null,
                "mode": null,
                "action": null,
                "actionLabel": null,
                "secondaryAction": null,
                "secondaryActionLabel": null,
            })
        );
        let error_payload = ProviderNotice::error("No local".to_owned()).payload();
        assert_eq!(
            serde_json::to_value(error_payload).unwrap().get("type"),
            Some(&Value::String("error".to_owned()))
        );
    }
}
