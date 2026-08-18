use super::*;
use std::sync::Arc;

#[derive(Clone, Default)]
struct FakeTransport {
    events: Arc<Mutex<Vec<SafeEvent>>>,
    budgets: Arc<Mutex<Vec<Duration>>>,
}

impl FakeTransport {
    fn events(&self) -> Vec<SafeEvent> {
        self.events.lock().clone()
    }
}

impl EventTransport for FakeTransport {
    fn send(&self, event: SafeEvent) {
        self.events.lock().push(event);
    }

    fn flush(&self, budget: Duration) {
        self.budgets.lock().push(budget);
    }
}

fn installation_id() -> String {
    "2ba3ac76-35c4-4a86-a063-1ea5732dfd8b".to_owned()
}

fn core(
    transport: FakeTransport,
    configured: bool,
    consent: bool,
    id: Option<String>,
) -> TelemetryCore<FakeTransport> {
    TelemetryCore {
        gate: TelemetryGate {
            configured,
            consent,
            installation_id: id,
        },
        transport,
    }
}

#[test]
fn events_redact_secret_sentinels_before_the_transport_boundary() {
    let transport = FakeTransport::default();
    let telemetry = core(transport.clone(), true, true, Some(installation_id()));
    let prompt = "PROMPT_SECRET_DO_NOT_SEND";
    let audio = "AUDIO_SECRET_DO_NOT_SEND";
    let key = "API_KEY_SECRET_DO_NOT_SEND";
    let account = "ACCOUNT_SECRET_DO_NOT_SEND";
    let path = "/private/PATH_SECRET_DO_NOT_SEND";

    assert!(telemetry.emit("transcription_failed", |event| {
        event.text("stage", safe_transcription_stage(prompt));
        event.text("mode", safe_mode(account));
        event.text("model_family", safe_model_family(key));
        event.text("reason", safe_failure_reason(audio));
        event.text("source", safe_audio_source(path));
    }));

    let serialized = serde_json::to_string(&transport.events()).unwrap();
    for sentinel in [prompt, audio, key, account, path] {
        assert!(!serialized.contains(sentinel));
    }
    assert!(serialized.contains("unknown"));
}

#[test]
fn consent_configuration_and_identity_all_gate_delivery() {
    let cases = [
        (false, true, Some(installation_id()), 0),
        (true, false, Some(installation_id()), 0),
        (true, true, None, 0),
        (true, true, Some("not-an-opaque-id".to_owned()), 0),
        (true, true, Some(installation_id()), 1),
    ];

    for (configured, consent, id, expected) in cases {
        let transport = FakeTransport::default();
        let telemetry = core(transport.clone(), configured, consent, id);
        telemetry.emit("desktop_started", |_| {});
        assert_eq!(transport.events().len(), expected);
    }
}

#[test]
fn opt_out_is_the_only_final_event_allowed_after_consent_is_disabled() {
    let transport = FakeTransport::default();
    let disabled = core(transport.clone(), true, false, Some(installation_id()));
    assert!(!disabled.emit("desktop_started", |_| {}));
    assert!(send_final_opt_out(
        transport.clone(),
        true,
        Some(installation_id())
    ));

    let events = transport.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].name, "analytics_opted_out");
}

#[test]
fn frontend_boundary_rejects_unknown_values_and_only_accepts_short_hex_fingerprints() {
    for index in 0..128 {
        let input = format!("UNTRUSTED_{index}_/secret");
        assert_eq!(safe_window_label(&input), "unknown");
        assert_eq!(safe_frontend_origin(&input), "unknown");
        assert_eq!(safe_frontend_error_type(&input), "unknown");
        assert_eq!(safe_short_fingerprint(&input), "unknown");
    }
    assert_eq!(safe_window_label("main"), "main");
    assert_eq!(safe_frontend_origin("window_error"), "window_error");
    assert_eq!(safe_frontend_error_type("TypeError"), "TypeError");
    assert_eq!(safe_short_fingerprint("A0b1C2d3"), "a0b1c2d3");
}

#[test]
fn failure_classification_has_stable_case_insensitive_precedence() {
    let cases = [
        ("CANCELLED while permission was denied", "cancelled"),
        (
            "PERMISSION denied for an unauthorized request",
            "permission",
        ),
        ("AUTHORIZATION failed after a quota limit", "auth"),
        ("RATE LIMIT timeout while network was down", "quota"),
        ("TIMED OUT while the network disconnected", "timeout"),
        ("NETWORK offline and resource unavailable", "network"),
        (
            "RESOURCE not found while no speech was detected",
            "resource",
        ),
        ("NO SPEECH from the microphone", "no_speech"),
        ("MODEL decode error after checksum verification", "model"),
        ("DECODE error after signature verification", "decode"),
        ("CHECKSUM verification failed on disk full", "verification"),
        ("DISK FULL in a worker task", "storage"),
        ("WORKER task failed", "task"),
        ("opaque diagnostic text", "unknown"),
    ];

    for (message, expected) in cases {
        assert_eq!(classify_failure_reason(message), expected);
    }
}

#[test]
fn crash_marker_is_sanitized_and_consumed_once() {
    let directory = tempfile::tempdir().unwrap();
    let marker = directory.path().join("last_crash.txt");
    fs::write(
        &marker,
        "phase=services\nPROMPT_SECRET\n/private/PATH_SECRET\nAPI_KEY_SECRET\n",
    )
    .unwrap();

    let phase = consume_crash_marker(&marker);
    assert_eq!(phase, Some("services"));
    assert!(!marker.exists());
    assert_eq!(consume_crash_marker(&marker), None);

    let event = SafeEvent::new("desktop_crash_recovered", installation_id());
    let serialized = serde_json::to_string(&event).unwrap();
    assert!(!serialized.contains("PROMPT_SECRET"));
    assert!(!serialized.contains("PATH_SECRET"));
    assert!(!serialized.contains("API_KEY_SECRET"));
}

#[test]
fn startup_progress_never_moves_backwards() {
    let progress = StartupProgress::new();
    assert_eq!(progress.advance("services"), "services");
    assert_eq!(progress.advance("logging"), "services");
    assert_eq!(progress.advance("running"), "running");
    assert_eq!(progress.advance("background_tasks"), "running");
    assert_eq!(progress.current(), "running");
}

#[test]
fn shutdown_flush_uses_a_bounded_budget() {
    let transport = FakeTransport::default();
    let telemetry = core(transport.clone(), true, true, Some(installation_id()));
    telemetry.flush_shutdown();

    let budgets = transport.budgets.lock().clone();
    assert_eq!(budgets, vec![SHUTDOWN_FLUSH_BUDGET]);
    assert!(budgets[0] <= Duration::from_millis(250));
}
