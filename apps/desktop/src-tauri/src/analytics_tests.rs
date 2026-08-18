use super::*;

#[test]
fn crash_phase_progress_is_monotonic_and_ignores_unknown_names() {
    let progress = AtomicU8::new(0);
    advance_crash_phase(&progress, "services");
    advance_crash_phase(&progress, "logging");
    advance_crash_phase(&progress, "permissions_startup_check");

    assert_eq!(phase_name(progress.load(Ordering::Relaxed)), "services");
    assert_eq!(phase_name(u8::MAX), "unknown");
}

#[test]
fn consent_requires_anonymous_identity_and_allows_the_final_opt_out() {
    let enabled = AnalyticsIdentity {
        enabled: true,
        distinct_id: "install-1".to_owned(),
    };
    let disabled = AnalyticsIdentity {
        enabled: false,
        distinct_id: "install-1".to_owned(),
    };
    let anonymous = AnalyticsIdentity {
        enabled: true,
        distinct_id: String::new(),
    };

    assert!(enabled.permits(Consent::OptedIn));
    assert!(!disabled.permits(Consent::OptedIn));
    assert!(disabled.permits(Consent::FinalOptOut));
    assert!(!anonymous.permits(Consent::FinalOptOut));
}

#[test]
fn transcription_payload_contains_metrics_but_no_transcript() {
    let properties =
        transcription_completed_properties("local", None, true, 2.5, 0.75, 8, "microphone");

    assert_eq!(
        properties,
        json!({
            "mode": "local",
            "model": "unknown",
            "llm_cleaned": true,
            "audio_duration_seconds": 2.5,
            "transcription_duration_seconds": 0.75,
            "word_count": 8,
            "audio_source": "microphone",
        })
    );
    assert!(properties.get("text").is_none());
}

#[test]
fn onboarding_and_frontend_crash_fields_are_bounded() {
    assert_eq!(onboarding_step("model_downloading"), "model_downloading");
    assert_eq!(onboarding_step("secret-form-value"), "unknown");

    assert_eq!(
        FrontendCrash::sanitize("main", "render", "TypeError", "0123abcdef"),
        FrontendCrash {
            window: "main".to_owned(),
            source: "render".to_owned(),
            error_kind: "TypeError".to_owned(),
            fingerprint: "0123abcdef".to_owned(),
        }
    );
    assert_eq!(
        FrontendCrash::sanitize("private", "message", "Custom", "not-a-hash"),
        FrontendCrash {
            window: "unknown".to_owned(),
            source: "unknown".to_owned(),
            error_kind: "unknown".to_owned(),
            fingerprint: "unknown".to_owned(),
        }
    );
}

#[test]
fn setting_differences_preserve_the_public_event_order() {
    let previous = UserSettings::default();
    let mut next = previous.clone();
    next.llm_enabled = !previous.llm_enabled;
    next.remote_speech_enabled = !previous.remote_speech_enabled;
    next.auto_dictionary_enabled = !previous.auto_dictionary_enabled;

    assert_eq!(
        changed_settings(&previous, &next)
            .into_iter()
            .map(|change| change.name)
            .collect::<Vec<_>>(),
        [
            "llm_enabled",
            "remote_speech_enabled",
            "auto_dictionary_enabled"
        ]
    );
}

#[test]
fn failure_classification_keeps_specific_rules_before_broad_ones() {
    assert_eq!(
        classify_failure_reason("permission denied while connecting"),
        "permission"
    );
    assert_eq!(
        classify_failure_reason("API key quota exceeded"),
        "unauthorized"
    );
    assert_eq!(classify_failure_reason("FFmpeg decode failed"), "decode");
    assert_eq!(classify_failure_reason("a surprising condition"), "unknown");
}

#[test]
fn panic_classification_handles_string_and_non_string_payloads() {
    assert_eq!(classify_panic(None), "non_string_panic");
    assert_eq!(
        classify_panic(Some("memory allocation of 20 bytes failed")),
        "out_of_memory"
    );
    assert_eq!(classify_panic(Some("called unwrap()")), "unwrap_or_expect");
    assert_eq!(classify_panic(Some("plain panic")), "string_panic");
}

#[test]
fn panic_artifacts_keep_marker_anonymous_and_detail_local() {
    let directory = tempfile::tempdir().unwrap();
    let marker = directory.path().join("last_crash.txt");
    let log = directory.path().join("crash.log");
    write_panic_artifacts(
        &marker,
        Some(&log),
        "src/foo.rs:10",
        Some("boom: index out of bounds"),
        "2026-06-24T00:00:00+00:00",
    );

    let marker_text = std::fs::read_to_string(marker).unwrap();
    assert!(marker_text.starts_with(&format!(
        "{APP_VERSION}\nsrc/foo.rs:10\nbounds_check\ncrash_phase="
    )));
    assert!(!marker_text.contains("boom"));
    let local_log = std::fs::read_to_string(log).unwrap();
    assert!(local_log.contains("location: src/foo.rs:10"));
    assert!(local_log.contains("message: boom: index out of bounds"));
    assert!(local_log.contains("review before sharing"));
}

#[test]
fn crash_markers_preserve_base_and_native_extension_fields() {
    let parsed = parse_crash_marker(
        "1.0.0\nnvcuda.dll+0x7ffd1234\nnative\nexception_code=0xc0000005\nfaulting_module=nvcuda.dll\n",
    );

    assert_eq!(parsed["crashed_version"], "1.0.0");
    assert_eq!(parsed["location"], "nvcuda.dll+0x7ffd1234");
    assert_eq!(parsed["crash_type"], "native");
    assert_eq!(parsed["exception_code"], "0xc0000005");
    assert_eq!(parsed["faulting_module"], "nvcuda.dll");

    let truncated = parse_crash_marker("1.0.0");
    assert_eq!(truncated["location"], "unknown");
    assert_eq!(truncated["crash_type"], "unknown");
}

#[test]
fn crash_marker_policy_groups_native_and_sanitized_rust_failures() {
    let native = CrashMarker::parse(
        "1.0\nnvcuda.dll+0x1234\nnative\nexception_code=0xc0000005\nfaulting_module=nvcuda.dll\n",
    );
    assert_eq!(native.mechanism, "native_crash");
    assert_eq!(native.location_key, "nvcuda.dll+0x1234");
    assert_eq!(native.fingerprint, "native:nvcuda.dll:0xc0000005");

    let rust = CrashMarker::parse("1.0\n/Users/alice/private/src/foo.rs:42\nbounds_check\n");
    assert_eq!(rust.mechanism, "rust_panic");
    assert_eq!(rust.location_key, "foo.rs:42");
    assert_eq!(rust.fingerprint, "bounds_check:foo.rs:42");
}

#[test]
fn merge_hash_and_frames_keep_crash_wire_contracts() {
    assert_eq!(
        merge_json_objects(json!({ "same": 1 }), json!({ "same": 2, "new": 3 })),
        json!({ "same": 2, "new": 3 })
    );
    assert_eq!(stable_hash("foo.rs:42"), "f7b17c839ab8835c");
    assert_eq!(
        crash_frame("foo.rs:42", "bounds_check"),
        json!({
            "filename": "foo.rs",
            "function": "bounds_check",
            "lang": "rust",
            "platform": "rust",
            "in_app": true,
            "synthetic": true,
            "resolved": true,
            "lineno": 42,
        })
    );
    assert_eq!(crash_frame("nvcuda.dll+0x1", "native")["resolved"], false);
}

#[test]
fn diagnostics_use_marker_phase_and_trim_remote_provider() {
    let mut settings = UserSettings::default();
    settings.remote_speech_enabled = true;
    settings.remote_speech_provider = "  custom  ".to_owned();
    settings.remote_speech_model = "remote-model".to_owned();
    let diagnostics = diagnostics_for_settings(&settings, &json!({ "crash_phase": "frontend" }));

    assert_eq!(diagnostics["crash_report_schema"], 2);
    assert_eq!(diagnostics["crash_phase"], "frontend");
    assert_eq!(diagnostics["speech_model_kind"], "remote");
    assert_eq!(diagnostics["remote_speech_provider"], "custom");
    assert_eq!(diagnostics["remote_speech_enabled"], true);
}
