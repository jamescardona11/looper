use std::{
    fmt,
    path::Path,
    time::{Duration, SystemTime},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use reqwest::{
    header::{HeaderValue, RETRY_AFTER},
    multipart::{Form, Part},
    Client, RequestBuilder, StatusCode, Url,
};
use serde::Deserialize;
use serde_json::{json, Value};

const TRANSCRIPTION_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const MODELS_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_ERROR_CHARS: usize = 500;
const MAX_CONTEXT_BIAS_TERMS: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteErrorKind {
    RateLimited,
    QuotaExceeded,
    Unauthorized,
    InvalidRequest,
    NotFound,
    UpstreamUnavailable,
    Other,
}

#[derive(Debug, Clone)]
pub(crate) struct RemoteError {
    pub(crate) kind: RemoteErrorKind,
    #[allow(dead_code)]
    pub(crate) status: u16,
    pub(crate) message: String,
    pub(crate) error_type: Option<String>,
    pub(crate) code: Option<String>,
    pub(crate) param: Option<String>,
    pub(crate) retry_after: Option<Duration>,
}

impl RemoteError {
    pub(crate) fn user_message(&self) -> String {
        let detail = self.message.trim();
        if !detail.is_empty() {
            return detail.to_string();
        }

        match self.kind {
            RemoteErrorKind::RateLimited => "Remote provider rate limit reached.".to_string(),
            RemoteErrorKind::QuotaExceeded => "Remote provider quota exceeded.".to_string(),
            RemoteErrorKind::Unauthorized => {
                "Remote provider API key is invalid or expired.".to_string()
            }
            RemoteErrorKind::InvalidRequest => "Remote provider rejected the request.".to_string(),
            RemoteErrorKind::NotFound => {
                "Remote provider endpoint or model was not found.".to_string()
            }
            RemoteErrorKind::UpstreamUnavailable | RemoteErrorKind::Other => {
                "Remote provider is unavailable.".to_string()
            }
        }
    }
}

impl fmt::Display for RemoteError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.user_message())
    }
}

impl std::error::Error for RemoteError {}

#[derive(Debug, Clone, Copy)]
pub(crate) struct RemoteRequestParams<'a> {
    pub(crate) model: &'a str,
    pub(crate) language: Option<&'a str>,
    pub(crate) dictionary: &'a [String],
    pub(crate) prompt: Option<&'a str>,
    pub(crate) timestamps: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TranscriptionSegment {
    pub(crate) start: f32,
    pub(crate) end: f32,
    pub(crate) text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Transcription {
    pub(crate) text: String,
    pub(crate) model_id: String,
    pub(crate) language: Option<String>,
    pub(crate) duration_ms: u64,
    pub(crate) segments: Option<Vec<TranscriptionSegment>>,
    pub(crate) words: Option<Vec<TranscriptionSegment>>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DiarizedSegment {
    pub(crate) start: f32,
    pub(crate) end: f32,
    pub(crate) text: String,
    pub(crate) speaker: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DiarizedTranscription {
    pub(crate) transcription: Transcription,
    pub(crate) segments: Option<Vec<DiarizedSegment>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderKind {
    OpenAiCompatible,
    Mistral,
    OpenRouter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ProviderProfile {
    kind: ProviderKind,
}

const OPENAI_PROFILE: ProviderProfile = ProviderProfile {
    kind: ProviderKind::OpenAiCompatible,
};
const MISTRAL_PROFILE: ProviderProfile = ProviderProfile {
    kind: ProviderKind::Mistral,
};
const OPENROUTER_PROFILE: ProviderProfile = ProviderProfile {
    kind: ProviderKind::OpenRouter,
};

pub(crate) async fn transcribe_file(
    client: &Client,
    endpoint: &str,
    api_key: &str,
    wav_path: &Path,
    params: RemoteRequestParams<'_>,
    diarization: bool,
) -> Result<DiarizedTranscription, RemoteError> {
    if endpoint.trim().is_empty() {
        return Err(config_error("Remote speech endpoint is not configured"));
    }
    if params.model.trim().is_empty() {
        return Err(config_error("Remote speech model is not configured"));
    }

    let base = api_base(endpoint);
    Url::parse(&base).map_err(|_| config_error("Remote speech endpoint is invalid"))?;
    let audio = tokio::fs::read(wav_path)
        .await
        .map_err(|error| transport_error(format!("Failed to read WAV file: {error}")))?;
    let profile = resolve_profile(endpoint);

    let response = match profile.kind {
        ProviderKind::OpenRouter => {
            transcribe_openrouter(client, &base, api_key, &audio, params).await?
        }
        ProviderKind::OpenAiCompatible | ProviderKind::Mistral => {
            transcribe_multipart(
                client,
                &base,
                api_key,
                &audio,
                wav_path,
                params,
                diarization,
                &profile,
            )
            .await?
        }
    };

    parse_transcription_body(&response, params.model, &profile, diarization)
}

pub(crate) async fn list_models(
    client: &Client,
    endpoint: &str,
    api_key: &str,
) -> Result<Vec<String>, RemoteError> {
    if endpoint.trim().is_empty() {
        return Ok(Vec::new());
    }

    let base = api_base(endpoint);
    Url::parse(&base).map_err(|_| config_error("Remote speech endpoint is invalid"))?;
    let profile = resolve_profile(endpoint);
    let mut url = format!("{base}/models");
    if profile.kind == ProviderKind::OpenRouter {
        url.push_str("?output_modalities=transcription");
    }

    let response = authenticated(client.get(url).timeout(MODELS_TIMEOUT), api_key)
        .send()
        .await
        .map_err(|error| {
            transport_error(format!("Failed to reach remote models endpoint: {error}"))
        })?;
    let body = response_body(response).await?;
    parse_models_body(&body)
}

pub(crate) fn supports_diarization(endpoint: &str) -> bool {
    resolve_profile(endpoint).kind == ProviderKind::Mistral
}

pub(crate) fn config_error(message: impl Into<String>) -> RemoteError {
    RemoteError {
        kind: RemoteErrorKind::InvalidRequest,
        status: 0,
        message: message.into(),
        error_type: None,
        code: None,
        param: None,
        retry_after: None,
    }
}

pub(crate) fn transport_error(message: impl Into<String>) -> RemoteError {
    RemoteError {
        kind: RemoteErrorKind::Other,
        status: 0,
        message: message.into(),
        error_type: None,
        code: None,
        param: None,
        retry_after: None,
    }
}

pub(crate) fn parse_upstream_error(
    status: StatusCode,
    retry_after: Option<Duration>,
    body: &str,
) -> RemoteError {
    let parsed = serde_json::from_str::<Value>(body).ok();
    let error_value = parsed
        .as_ref()
        .and_then(|value| value.get("error"))
        .or(parsed.as_ref());

    let message = error_value
        .and_then(|value| {
            value
                .as_str()
                .map(str::to_string)
                .or_else(|| string_field(value, "message"))
        })
        .or_else(|| {
            parsed
                .as_ref()
                .and_then(|value| string_field(value, "message"))
        })
        .unwrap_or_else(|| truncate(body.trim(), MAX_ERROR_CHARS));
    let error_type = error_value.and_then(|value| string_field(value, "type"));
    let code = error_value.and_then(|value| scalar_field(value, "code"));
    let param = error_value.and_then(|value| scalar_field(value, "param"));
    let classification = [
        message.as_str(),
        error_type.as_deref().unwrap_or_default(),
        code.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    let kind = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => RemoteErrorKind::Unauthorized,
        StatusCode::PAYMENT_REQUIRED => RemoteErrorKind::QuotaExceeded,
        StatusCode::NOT_FOUND => RemoteErrorKind::NotFound,
        StatusCode::TOO_MANY_REQUESTS if indicates_quota(&classification) => {
            RemoteErrorKind::QuotaExceeded
        }
        StatusCode::TOO_MANY_REQUESTS => RemoteErrorKind::RateLimited,
        _ if status.is_server_error()
            || matches!(
                status,
                StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT
            ) =>
        {
            RemoteErrorKind::UpstreamUnavailable
        }
        _ if status.is_client_error() => RemoteErrorKind::InvalidRequest,
        _ => RemoteErrorKind::Other,
    };

    RemoteError {
        kind,
        status: status.as_u16(),
        message,
        error_type,
        code,
        param,
        retry_after,
    }
}

pub(crate) fn parse_retry_after(value: Option<&HeaderValue>) -> Option<Duration> {
    let value = value?.to_str().ok()?.trim();
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }

    let retry_at = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    let retry_at = SystemTime::from(retry_at);
    Some(
        retry_at
            .duration_since(SystemTime::now())
            .unwrap_or(Duration::ZERO),
    )
}

async fn transcribe_multipart(
    client: &Client,
    base: &str,
    api_key: &str,
    audio: &[u8],
    wav_path: &Path,
    params: RemoteRequestParams<'_>,
    diarization: bool,
    profile: &ProviderProfile,
) -> Result<String, RemoteError> {
    let verbose = params.timestamps && profile.kind == ProviderKind::OpenAiCompatible;
    let first = send_multipart(
        client,
        base,
        api_key,
        audio,
        wav_path,
        params,
        diarization,
        profile,
        verbose,
    )
    .await;

    match first {
        Err(error) if verbose && is_verbose_unsupported(&error) => {
            send_multipart(
                client,
                base,
                api_key,
                audio,
                wav_path,
                params,
                diarization,
                profile,
                false,
            )
            .await
        }
        result => result,
    }
}

#[allow(clippy::too_many_arguments)]
async fn send_multipart(
    client: &Client,
    base: &str,
    api_key: &str,
    audio: &[u8],
    wav_path: &Path,
    params: RemoteRequestParams<'_>,
    diarization: bool,
    profile: &ProviderProfile,
    verbose: bool,
) -> Result<String, RemoteError> {
    let file_name = wav_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("audio.wav")
        .to_string();
    let file = Part::bytes(audio.to_vec())
        .file_name(file_name)
        .mime_str("audio/wav")
        .map_err(|error| config_error(format!("Failed to prepare WAV upload: {error}")))?;
    let form = multipart_fields(profile, params, diarization, verbose)
        .into_iter()
        .fold(Form::new().part("file", file), |form, (name, value)| {
            form.text(name, value)
        });

    let request = client
        .post(format!("{base}/audio/transcriptions"))
        .timeout(TRANSCRIPTION_TIMEOUT)
        .multipart(form);
    let response = authenticated(request, api_key)
        .send()
        .await
        .map_err(|error| {
            transport_error(format!("Failed to reach remote speech provider: {error}"))
        })?;
    response_body(response).await
}

async fn transcribe_openrouter(
    client: &Client,
    base: &str,
    api_key: &str,
    audio: &[u8],
    params: RemoteRequestParams<'_>,
) -> Result<String, RemoteError> {
    let first = send_openrouter(client, base, api_key, audio, params, params.timestamps).await;
    match first {
        Err(error) if params.timestamps && is_verbose_unsupported(&error) => {
            send_openrouter(client, base, api_key, audio, params, false).await
        }
        result => result,
    }
}

async fn send_openrouter(
    client: &Client,
    base: &str,
    api_key: &str,
    audio: &[u8],
    params: RemoteRequestParams<'_>,
    verbose: bool,
) -> Result<String, RemoteError> {
    let body = openrouter_body(audio, params, verbose);
    let request = client
        .post(format!("{base}/audio/transcriptions"))
        .timeout(TRANSCRIPTION_TIMEOUT)
        .json(&body);
    let response = authenticated(request, api_key)
        .send()
        .await
        .map_err(|error| {
            transport_error(format!("Failed to reach remote speech provider: {error}"))
        })?;
    response_body(response).await
}

async fn response_body(response: reqwest::Response) -> Result<String, RemoteError> {
    let status = response.status();
    let retry_after = parse_retry_after(response.headers().get(RETRY_AFTER));
    let body = response.text().await.map_err(|error| {
        transport_error(format!("Failed to read remote provider response: {error}"))
    })?;

    if status.is_success() {
        Ok(body)
    } else {
        Err(parse_upstream_error(status, retry_after, &body))
    }
}

fn authenticated(request: RequestBuilder, api_key: &str) -> RequestBuilder {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        request
    } else {
        request.bearer_auth(api_key)
    }
}

fn multipart_fields(
    profile: &ProviderProfile,
    params: RemoteRequestParams<'_>,
    diarization: bool,
    verbose: bool,
) -> Vec<(String, String)> {
    let mut fields = vec![("model".to_string(), params.model.trim().to_string())];
    if let Some(language) = non_empty(params.language) {
        fields.push(("language".to_string(), language.to_string()));
    }

    match profile.kind {
        ProviderKind::Mistral => {
            let context_bias = params
                .dictionary
                .iter()
                .map(|term| term.trim())
                .filter(|term| !term.is_empty())
                .take(MAX_CONTEXT_BIAS_TERMS)
                .collect::<Vec<_>>()
                .join(",");
            if !context_bias.is_empty() {
                fields.push(("context_bias".to_string(), context_bias));
            }
            if diarization {
                fields.push(("diarize".to_string(), "true".to_string()));
            }
            if params.timestamps || diarization {
                fields.push(("timestamp_granularities".to_string(), "segment".to_string()));
            }
            if params.timestamps {
                fields.push(("timestamp_granularities".to_string(), "word".to_string()));
            }
        }
        ProviderKind::OpenAiCompatible => {
            if let Some(prompt) = request_prompt(params) {
                fields.push(("prompt".to_string(), prompt));
            }
            if verbose {
                fields.push(("response_format".to_string(), "verbose_json".to_string()));
                fields.push((
                    "timestamp_granularities[]".to_string(),
                    "segment".to_string(),
                ));
                fields.push(("timestamp_granularities[]".to_string(), "word".to_string()));
            }
        }
        ProviderKind::OpenRouter => {}
    }

    fields
}

fn openrouter_body(audio: &[u8], params: RemoteRequestParams<'_>, verbose: bool) -> Value {
    let mut body = json!({
        "model": params.model.trim(),
        "input_audio": {
            "data": BASE64_STANDARD.encode(audio),
            "format": "wav"
        }
    });
    let object = body
        .as_object_mut()
        .expect("OpenRouter request is always an object");
    if let Some(language) = non_empty(params.language) {
        object.insert("language".to_string(), Value::String(language.to_string()));
    }
    if verbose {
        object.insert(
            "response_format".to_string(),
            Value::String("verbose_json".to_string()),
        );
        object.insert(
            "timestamp_granularities".to_string(),
            json!(["segment", "word"]),
        );
    }
    body
}

fn request_prompt(params: RemoteRequestParams<'_>) -> Option<String> {
    if let Some(prompt) = non_empty(params.prompt) {
        return Some(prompt.to_string());
    }

    let dictionary = params
        .dictionary
        .iter()
        .map(|term| term.trim())
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
    (!dictionary.is_empty()).then_some(dictionary)
}

#[derive(Debug, Deserialize)]
struct WireTranscription {
    #[serde(default)]
    text: String,
    model: Option<String>,
    language: Option<String>,
    duration: Option<f64>,
    segments: Option<Vec<WireSegment>>,
    words: Option<Vec<WireSegment>>,
    usage: Option<WireUsage>,
}

#[derive(Debug, Deserialize)]
struct WireSegment {
    start: f32,
    end: f32,
    #[serde(default)]
    text: String,
    word: Option<String>,
    #[serde(alias = "speaker_id")]
    speaker: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WireUsage {
    seconds: Option<f64>,
    prompt_audio_seconds: Option<f64>,
}

fn parse_transcription_body(
    body: &str,
    requested_model: &str,
    _profile: &ProviderProfile,
    diarization: bool,
) -> Result<DiarizedTranscription, RemoteError> {
    let mut wire: WireTranscription = serde_json::from_str(body).map_err(|error| {
        transport_error(format!(
            "Failed to parse remote transcription response: {error}"
        ))
    })?;

    let duration_seconds = wire
        .duration
        .or_else(|| wire.usage.as_ref().and_then(|usage| usage.seconds))
        .or_else(|| {
            wire.usage
                .as_ref()
                .and_then(|usage| usage.prompt_audio_seconds)
        })
        .or_else(|| latest_end(wire.segments.as_deref(), wire.words.as_deref()))
        .unwrap_or_default();
    let diarized_segments = if diarization {
        wire.segments
            .as_deref()
            .map(|segments| {
                segments
                    .iter()
                    .filter(|segment| valid_times(segment.start, segment.end))
                    .map(|segment| DiarizedSegment {
                        start: segment.start,
                        end: segment.end,
                        text: segment.text.clone(),
                        speaker: segment.speaker.clone(),
                    })
                    .collect::<Vec<_>>()
            })
            .filter(|segments| !segments.is_empty())
    } else {
        None
    };

    let segments = wire
        .segments
        .take()
        .map(|segments| timed_segments(segments, false))
        .filter(|segments| !segments.is_empty());
    let words = wire
        .words
        .take()
        .map(|segments| timed_segments(segments, true))
        .filter(|segments| !segments.is_empty());

    Ok(DiarizedTranscription {
        transcription: Transcription {
            text: wire.text,
            model_id: wire
                .model
                .filter(|model| !model.trim().is_empty())
                .unwrap_or_else(|| requested_model.to_string()),
            language: wire.language,
            duration_ms: seconds_to_millis(duration_seconds),
            segments,
            words,
        },
        segments: diarized_segments,
    })
}

fn parse_models_body(body: &str) -> Result<Vec<String>, RemoteError> {
    let value: Value = serde_json::from_str(body)
        .map_err(|error| transport_error(format!("Failed to parse models response: {error}")))?;
    let models = value
        .as_array()
        .or_else(|| value.get("data").and_then(Value::as_array))
        .or_else(|| value.get("models").and_then(Value::as_array))
        .ok_or_else(|| transport_error("Models response did not contain a model list"))?;

    Ok(models
        .iter()
        .filter_map(|model| model.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .collect())
}

fn timed_segments(segments: Vec<WireSegment>, prefer_word: bool) -> Vec<TranscriptionSegment> {
    segments
        .into_iter()
        .filter(|segment| valid_times(segment.start, segment.end))
        .map(|segment| TranscriptionSegment {
            start: segment.start,
            end: segment.end,
            text: if prefer_word {
                segment.word.unwrap_or(segment.text)
            } else {
                segment.text
            },
        })
        .collect()
}

fn latest_end(segments: Option<&[WireSegment]>, words: Option<&[WireSegment]>) -> Option<f64> {
    segments
        .into_iter()
        .chain(words)
        .flatten()
        .map(|segment| f64::from(segment.end))
        .filter(|end| end.is_finite() && *end >= 0.0)
        .max_by(f64::total_cmp)
}

fn valid_times(start: f32, end: f32) -> bool {
    start.is_finite() && end.is_finite() && start >= 0.0 && end >= start
}

fn seconds_to_millis(seconds: f64) -> u64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds * 1_000.0).round().min(u64::MAX as f64) as u64
}

fn resolve_profile(endpoint: &str) -> ProviderProfile {
    let Some(url) = endpoint_url(endpoint) else {
        return OPENAI_PROFILE;
    };
    match url
        .host_str()
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "api.mistral.ai" => MISTRAL_PROFILE,
        "openrouter.ai" => OPENROUTER_PROFILE,
        _ => OPENAI_PROFILE,
    }
}

fn api_base(endpoint: &str) -> String {
    let Some(mut url) = endpoint_url(endpoint) else {
        return endpoint.trim().trim_end_matches('/').to_string();
    };
    url.set_query(None);
    url.set_fragment(None);

    let mut path = url.path().trim_end_matches('/').to_string();
    for suffix in ["/audio/transcriptions", "/models"] {
        if path.ends_with(suffix) {
            path.truncate(path.len() - suffix.len());
            break;
        }
    }
    path = path.trim_end_matches('/').to_string();
    if path.is_empty() {
        path = "/v1".to_string();
    } else if !path.ends_with("/v1") {
        path.push_str("/v1");
    }
    url.set_path(&path);
    url.to_string().trim_end_matches('/').to_string()
}

fn endpoint_url(endpoint: &str) -> Option<Url> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return None;
    }
    let lower = endpoint.to_ascii_lowercase();
    let with_scheme = if lower.starts_with("http://") || lower.starts_with("https://") {
        endpoint.to_string()
    } else if is_local_endpoint(&lower) {
        format!("http://{endpoint}")
    } else {
        format!("https://{endpoint}")
    };
    Url::parse(&with_scheme).ok()
}

fn is_local_endpoint(endpoint: &str) -> bool {
    endpoint.starts_with("localhost")
        || endpoint.starts_with("127.")
        || endpoint.starts_with("0.0.0.0")
        || endpoint.starts_with("[::1]")
}

fn is_verbose_unsupported(error: &RemoteError) -> bool {
    if error.kind != RemoteErrorKind::InvalidRequest {
        return false;
    }
    let detail = [
        error.message.as_str(),
        error.error_type.as_deref().unwrap_or_default(),
        error.code.as_deref().unwrap_or_default(),
        error.param.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase();
    (detail.contains("verbose_json") || detail.contains("timestamp_granularit"))
        && (detail.contains("unsupported")
            || detail.contains("not support")
            || detail.contains("invalid"))
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field)?.as_str().map(str::to_string)
}

fn scalar_field(value: &Value, field: &str) -> Option<String> {
    let value = value.get(field)?;
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
        .or_else(|| value.as_u64().map(|number| number.to_string()))
}

fn indicates_quota(detail: &str) -> bool {
    [
        "quota",
        "insufficient_quota",
        "billing",
        "payment",
        "credit",
    ]
    .iter()
    .any(|marker| detail.contains(marker))
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut result = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        result.push('…');
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params<'a>(
        model: &'a str,
        language: Option<&'a str>,
        dictionary: &'a [String],
        timestamps: bool,
    ) -> RemoteRequestParams<'a> {
        RemoteRequestParams {
            model,
            language,
            dictionary,
            prompt: None,
            timestamps,
        }
    }

    #[test]
    fn parses_openai_transcription_with_segments_and_words() {
        let result = parse_transcription_body(
            r#"{
                "text": "Hello world",
                "language": "en",
                "duration": 1.75,
                "segments": [{"start": 0.0, "end": 1.75, "text": "Hello world"}],
                "words": [{"start": 0.0, "end": 0.4, "word": "Hello"}]
            }"#,
            "gpt-4o-mini-transcribe",
            &OPENAI_PROFILE,
            false,
        )
        .expect("valid OpenAI response");

        assert_eq!(result.transcription.duration_ms, 1_750);
        assert_eq!(
            result.transcription.segments.as_deref(),
            Some(
                [TranscriptionSegment {
                    start: 0.0,
                    end: 1.75,
                    text: "Hello world".to_string(),
                }]
                .as_slice()
            )
        );
        assert_eq!(
            result.transcription.words.as_deref(),
            Some(
                [TranscriptionSegment {
                    start: 0.0,
                    end: 0.4,
                    text: "Hello".to_string(),
                }]
                .as_slice()
            )
        );
    }

    #[test]
    fn parses_mistral_diarization_and_usage_duration() {
        let result = parse_transcription_body(
            r#"{
                "text": "Hello there",
                "segments": [{
                    "start": 0.25,
                    "end": 1.5,
                    "text": "Hello there",
                    "speaker_id": "speaker_0"
                }],
                "usage": {"prompt_audio_seconds": 2}
            }"#,
            "voxtral-mini-latest",
            &MISTRAL_PROFILE,
            true,
        )
        .expect("valid Mistral response");

        assert_eq!(result.transcription.duration_ms, 2_000);
        assert_eq!(
            result.segments.as_deref(),
            Some(
                [DiarizedSegment {
                    start: 0.25,
                    end: 1.5,
                    text: "Hello there".to_string(),
                    speaker: Some("speaker_0".to_string()),
                }]
                .as_slice()
            )
        );
    }

    #[test]
    fn parses_openrouter_verbose_response() {
        let result = parse_transcription_body(
            r#"{
                "text": "OpenRouter transcript",
                "language": "en",
                "segments": [{"start": 0.0, "end": 3.25, "text": "OpenRouter transcript"}],
                "usage": {"seconds": 3.25}
            }"#,
            "openai/whisper-1",
            &OPENROUTER_PROFILE,
            false,
        )
        .expect("valid OpenRouter response");

        assert_eq!(result.transcription.duration_ms, 3_250);
        assert_eq!(result.transcription.model_id, "openai/whisper-1");
    }

    #[test]
    fn builds_openai_verbose_multipart_fields() {
        let dictionary = vec!["Looper".to_string(), "Voxtral".to_string()];
        let fields = multipart_fields(
            &OPENAI_PROFILE,
            params("whisper-1", Some("en"), &dictionary, true),
            false,
            true,
        );

        assert!(fields.contains(&("model".to_string(), "whisper-1".to_string())));
        assert!(fields.contains(&("language".to_string(), "en".to_string())));
        assert!(fields.contains(&("prompt".to_string(), "Looper, Voxtral".to_string())));
        assert!(fields.contains(&("response_format".to_string(), "verbose_json".to_string())));
        assert!(fields.contains(&("timestamp_granularities[]".to_string(), "word".to_string())));
    }

    #[test]
    fn builds_mistral_context_bias_and_diarization_fields() {
        let dictionary = vec!["Looper".to_string(), "Voxtral".to_string()];
        let fields = multipart_fields(
            &MISTRAL_PROFILE,
            params("voxtral-mini-latest", None, &dictionary, true),
            true,
            false,
        );

        assert!(fields.contains(&("context_bias".to_string(), "Looper,Voxtral".to_string())));
        assert!(fields.contains(&("diarize".to_string(), "true".to_string())));
        assert_eq!(
            fields
                .iter()
                .filter(|(name, _)| name == "timestamp_granularities")
                .count(),
            2
        );
    }

    #[test]
    fn builds_openrouter_base64_request() {
        let body = openrouter_body(
            b"RIFF",
            params("openai/whisper-1", Some("es"), &[], true),
            true,
        );

        assert_eq!(body["input_audio"]["data"], "UklGRg==");
        assert_eq!(body["input_audio"]["format"], "wav");
        assert_eq!(body["language"], "es");
        assert_eq!(body["response_format"], "verbose_json");
        assert_eq!(body["timestamp_granularities"], json!(["segment", "word"]));
    }

    #[test]
    fn parses_wrapped_and_bare_model_lists() {
        assert_eq!(
            parse_models_body(r#"{"data":[{"id":"one"},{"id":"two"}]}"#).expect("wrapped models"),
            vec!["one", "two"]
        );
        assert_eq!(
            parse_models_body(r#"[{"id":"three"}]"#).expect("bare models"),
            vec!["three"]
        );
    }

    #[test]
    fn parses_error_envelope_and_retry_after_seconds() {
        let retry_after = HeaderValue::from_static("30");
        let error = parse_upstream_error(
            StatusCode::TOO_MANY_REQUESTS,
            parse_retry_after(Some(&retry_after)),
            r#"{"error":{"message":"Rate limit reached","type":"tokens","code":"rate_limit_exceeded"}}"#,
        );

        assert_eq!(error.kind, RemoteErrorKind::RateLimited);
        assert_eq!(error.code.as_deref(), Some("rate_limit_exceeded"));
        assert_eq!(error.retry_after, Some(Duration::from_secs(30)));
    }

    #[test]
    fn classifies_payment_and_insufficient_quota() {
        let payment = parse_upstream_error(
            StatusCode::PAYMENT_REQUIRED,
            None,
            r#"{"error":{"message":"Add credits"}}"#,
        );
        let quota = parse_upstream_error(
            StatusCode::TOO_MANY_REQUESTS,
            None,
            r#"{"error":{"message":"Quota exhausted","code":"insufficient_quota"}}"#,
        );

        assert_eq!(payment.kind, RemoteErrorKind::QuotaExceeded);
        assert_eq!(quota.kind, RemoteErrorKind::QuotaExceeded);
    }

    #[test]
    fn parses_http_date_retry_after() {
        let retry_after = HeaderValue::from_static("Wed, 21 Oct 2015 07:28:00 GMT");
        assert_eq!(parse_retry_after(Some(&retry_after)), Some(Duration::ZERO));
    }

    #[test]
    fn detects_verbose_json_compatibility_fallback() {
        let error = parse_upstream_error(
            StatusCode::BAD_REQUEST,
            None,
            r#"{"error":{"message":"Unsupported response_format: verbose_json","type":"invalid_request_error","param":"response_format"}}"#,
        );

        assert!(is_verbose_unsupported(&error));
        assert_eq!(error.kind, RemoteErrorKind::InvalidRequest);
    }

    #[test]
    fn special_profiles_match_hosts_without_matching_paths_or_lookalikes() {
        assert_eq!(
            resolve_profile("https://api.mistral.ai/v1"),
            MISTRAL_PROFILE
        );
        assert_eq!(
            resolve_profile("https://openrouter.ai/api/v1"),
            OPENROUTER_PROFILE
        );
        assert_eq!(
            resolve_profile("https://proxy.example/mistral.ai/v1"),
            OPENAI_PROFILE
        );
        assert_eq!(
            resolve_profile("https://mistral.ai.evil.example/v1"),
            OPENAI_PROFILE
        );
    }

    #[test]
    fn normalizes_api_base_and_infers_local_scheme() {
        assert_eq!(
            api_base("api.example.com/v1/audio/transcriptions"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            api_base("localhost:8000/audio/transcriptions"),
            "http://localhost:8000/v1"
        );
        assert_eq!(
            api_base("https://openrouter.ai/api/v1"),
            "https://openrouter.ai/api/v1"
        );
    }
}
