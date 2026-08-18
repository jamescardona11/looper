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
