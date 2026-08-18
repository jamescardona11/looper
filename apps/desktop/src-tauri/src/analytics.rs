//! Anonymous product telemetry and local crash diagnostics.
//!
//! Event builders in this module intentionally accept bounded product fields;
//! transcript and audio content never enters an analytics payload.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::Manager;

use crate::{settings::UserSettings, AppRuntime, AppState};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const POSTHOG_API_KEY: Option<&str> = option_env!("POSTHOG_API_KEY");
const POSTHOG_HOST: Option<&str> = option_env!("POSTHOG_HOST");
const SHUTDOWN_LIMIT: Duration = Duration::from_secs(2);
const CRASH_PHASES: &[&str] = &[
    "startup",
    "setup_start",
    "logging",
    "crash_handler",
    "settings_load",
    "app_state",
    "services",
    "tray_shortcuts",
    "background_tasks",
    "analytics_init",
    "recording_recovery",
    "running",
];
static CRASH_PHASE: AtomicU8 = AtomicU8::new(0);

pub fn set_crash_phase(phase: &'static str) {
    advance_crash_phase(&CRASH_PHASE, phase);
}

pub(crate) fn crash_phase() -> &'static str {
    phase_name(CRASH_PHASE.load(Ordering::Relaxed))
}

fn advance_crash_phase(progress: &AtomicU8, phase: &str) {
    let Some(next) = CRASH_PHASES
        .iter()
        .position(|candidate| *candidate == phase)
    else {
        return;
    };
    let next = next as u8;
    let mut observed = progress.load(Ordering::Relaxed);
    while next > observed {
        match progress.compare_exchange_weak(observed, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => break,
            Err(actual) => observed = actual,
        }
    }
}

fn phase_name(index: u8) -> &'static str {
    CRASH_PHASES
        .get(usize::from(index))
        .copied()
        .unwrap_or("unknown")
}

struct AnalyticsConfig {
    api_key: &'static str,
    host: &'static str,
}

impl AnalyticsConfig {
    fn compiled() -> Option<Self> {
        match (POSTHOG_API_KEY, POSTHOG_HOST) {
            (Some(api_key), Some(host)) if !api_key.is_empty() && !host.is_empty() => {
                Some(Self { api_key, host })
            }
            _ => None,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct AnalyticsIdentity {
    enabled: bool,
    distinct_id: String,
}

impl AnalyticsIdentity {
    fn from_app(app: &tauri::AppHandle<AppRuntime>) -> Self {
        let (enabled, distinct_id) = app.state::<AppState>().analytics_state();
        Self {
            enabled,
            distinct_id,
        }
    }

    fn permits(&self, consent: Consent) -> bool {
        !self.distinct_id.is_empty() && (!consent.requires_enabled() || self.enabled)
    }
}

#[derive(Clone, Copy)]
enum Consent {
    OptedIn,
    FinalOptOut,
}

impl Consent {
    fn requires_enabled(self) -> bool {
        matches!(self, Self::OptedIn)
    }
}

pub async fn init(app: &tauri::AppHandle<AppRuntime>) {
    let Some(config) = AnalyticsConfig::compiled() else {
        return;
    };
    let identity = AnalyticsIdentity::from_app(app);
    if !identity.permits(Consent::OptedIn) {
        return;
    }

    let error_tracking = match posthog_rs::ErrorTrackingOptionsBuilder::default()
        .capture_panics(false)
        .capture_stacktrace(false)
        .build()
    {
        Ok(options) => options,
        Err(error) => {
            tracing::error!("Failed to build PostHog error tracking options: {error}");
            return;
        }
    };
    let client_options = match posthog_rs::ClientOptionsBuilder::default()
        .api_key(config.api_key.to_owned())
        .host(config.host)
        .error_tracking(error_tracking)
        .build()
    {
        Ok(options) => options,
        Err(error) => {
            tracing::error!("Failed to build PostHog client options: {error}");
            return;
        }
    };
    if let Err(error) = posthog_rs::init_global(client_options).await {
        tracing::error!("Failed to init PostHog: {error}");
        return;
    }

    posthog_rs::capture(identify_event(&identity.distinct_id));
}

fn identify_event(distinct_id: &str) -> posthog_rs::Event {
    let mut event = posthog_rs::Event::new("$identify", distinct_id);
    let _ = event.insert_prop(
        "$set",
        json!({
            "app_version": APP_VERSION,
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        }),
    );
    let _ = event.insert_prop(
        "$set_once",
        json!({ "install_date": chrono::Utc::now().to_rfc3339() }),
    );
    event
}

struct EventDraft<'a> {
    name: &'a str,
    properties: Value,
    consent: Consent,
}

impl<'a> EventDraft<'a> {
    fn usage(name: &'a str, properties: Value) -> Self {
        Self {
            name,
            properties,
            consent: Consent::OptedIn,
        }
    }

    fn final_opt_out() -> Self {
        Self {
            name: "analytics_opt_out",
            properties: json!({}),
            consent: Consent::FinalOptOut,
        }
    }

    fn materialize(self, distinct_id: &str) -> posthog_rs::Event {
        let mut event = posthog_rs::Event::new(self.name, distinct_id);
        let _ = event.insert_prop("app_version", APP_VERSION);
        let _ = event.insert_prop("platform", std::env::consts::OS);
        if let Some(properties) = self.properties.as_object() {
            for (key, value) in properties {
                let _ = event.insert_prop(key, value.clone());
            }
        }
        event
    }
}

fn prepare_event(
    app: &tauri::AppHandle<AppRuntime>,
    draft: EventDraft<'_>,
) -> Option<posthog_rs::Event> {
    AnalyticsConfig::compiled()?;
    let identity = AnalyticsIdentity::from_app(app);
    identity
        .permits(draft.consent)
        .then(|| draft.materialize(&identity.distinct_id))
}

struct TelemetryRoute;

impl TelemetryRoute {
    fn send(app: &tauri::AppHandle<AppRuntime>, name: &str, properties: Value) {
        if let Some(event) = prepare_event(app, EventDraft::usage(name, properties)) {
            posthog_rs::capture(event);
        }
    }
}

fn enqueue(app: &tauri::AppHandle<AppRuntime>, name: &str, properties: Value) {
    TelemetryRoute::send(app, name, properties);
}

struct ExceptionDraft<'a> {
    exception_type: &'a str,
    value: &'a str,
    mechanism: &'a str,
    fingerprint: &'a str,
    frame: Option<Value>,
    extra: Value,
}

impl ExceptionDraft<'_> {
    fn capture(self, app: &tauri::AppHandle<AppRuntime>) {
        let Some(mut event) = prepare_event(app, EventDraft::usage("$exception", self.extra))
        else {
            return;
        };
        let mut exception = json!({
            "type": self.exception_type,
            "value": self.value,
            "mechanism": {
                "type": self.mechanism,
                "handled": false,
                "synthetic": false,
            },
        });
        if let Some(frame) = self.frame {
            exception["stacktrace"] = json!({ "type": "raw", "frames": [frame] });
        }
        let _ = event.insert_prop("$exception_list", json!([exception]));
        let _ = event.insert_prop("$exception_level", "error");
        let _ = event.insert_prop("$exception_fingerprint", self.fingerprint);
        posthog_rs::capture(event);
    }
}

fn crash_context(app: &tauri::AppHandle<AppRuntime>, marker: &Value) -> Value {
    diagnostics_for_settings(&app.state::<AppState>().current_settings(), marker)
}

fn diagnostics_for_settings(settings: &UserSettings, marker: &Value) -> Value {
    let selected_model = crate::speech::selected_model(settings);
    let selected_model_kind = if crate::remote_speech::is_remote_model(&selected_model) {
        "remote"
    } else {
        "local"
    };
    let local_manifest = crate::model_manager::definition(&settings.local_model);
    let phase = marker
        .get("crash_phase")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| crash_phase().to_owned());
    json!({
        "crash_report_schema": 2,
        "crash_phase": phase,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cpu_features": cpu_features(),
        "speech_model_kind": selected_model_kind,
        "speech_model": selected_model,
        "local_model": settings.local_model,
        "local_model_engine": local_manifest.map(|manifest| format!("{:?}", manifest.engine)),
        "local_model_family": local_manifest.map(|manifest| manifest.family),
        "remote_speech_provider": settings.remote_speech_enabled
            .then(|| settings.remote_speech_provider.trim()),
        "remote_speech_enabled": settings.remote_speech_enabled,
        "llm_enabled": settings.llm_enabled,
    })
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
fn cpu_features() -> Vec<&'static str> {
    [
        ("sse4.2", std::arch::is_x86_feature_detected!("sse4.2")),
        ("avx", std::arch::is_x86_feature_detected!("avx")),
        ("avx2", std::arch::is_x86_feature_detected!("avx2")),
        ("fma", std::arch::is_x86_feature_detected!("fma")),
        ("avx512f", std::arch::is_x86_feature_detected!("avx512f")),
    ]
    .into_iter()
    .filter_map(|(name, present)| present.then_some(name))
    .collect()
}

#[cfg(target_arch = "aarch64")]
fn cpu_features() -> Vec<&'static str> {
    vec!["neon"]
}

#[cfg(not(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64")))]
fn cpu_features() -> Vec<&'static str> {
    Vec::new()
}

pub fn track_analytics_opt_out(app: &tauri::AppHandle<AppRuntime>) {
    if let Some(event) = prepare_event(app, EventDraft::final_opt_out()) {
        posthog_rs::capture(event);
    }
}

fn event_properties<const N: usize>(entries: [(&str, Value); N]) -> Value {
    Value::Object(
        entries
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect(),
    )
}

macro_rules! define_usage_event {
    ($function:ident {} => $event:literal, $properties:expr) => {
        pub fn $function(app: &tauri::AppHandle<AppRuntime>) {
            enqueue(app, $event, $properties);
        }
    };
    (
        $function:ident {
            $($argument:ident: $kind:ty;)*
        } => $event:literal, $properties:expr
    ) => {
        #[allow(clippy::too_many_arguments)]
        pub fn $function(
            app: &tauri::AppHandle<AppRuntime>,
            $($argument: $kind),*
        ) {
            enqueue(app, $event, $properties);
        }
    };
}

define_usage_event!(track_app_started {} => "app_started", json!({}));
define_usage_event!(track_app_installed {} => "app_installed", json!({}));

define_usage_event!(
    track_transcription_completed {
        mode: &str;
        model: Option<&str>;
        llm_cleaned: bool;
        audio_duration_seconds: f32;
        transcription_duration_seconds: f32;
        word_count: u32;
        audio_source: &str;
    } => "transcription_completed",
    transcription_completed_properties(
            mode,
            model,
            llm_cleaned,
            audio_duration_seconds,
            transcription_duration_seconds,
            word_count,
            audio_source,
        )
);

#[allow(clippy::too_many_arguments)]
fn transcription_completed_properties(
    mode: &str,
    model: Option<&str>,
    llm_cleaned: bool,
    audio_duration_seconds: f32,
    transcription_duration_seconds: f32,
    word_count: u32,
    audio_source: &str,
) -> Value {
    event_properties([
        ("mode", json!(mode)),
        ("model", json!(model.unwrap_or("unknown"))),
        ("llm_cleaned", json!(llm_cleaned)),
        ("audio_duration_seconds", json!(audio_duration_seconds)),
        (
            "transcription_duration_seconds",
            json!(transcription_duration_seconds),
        ),
        ("word_count", json!(word_count)),
        ("audio_source", json!(audio_source)),
    ])
}

define_usage_event!(
    track_transcription_failed {
        stage: &str;
        mode: &str;
        model: &str;
        reason: &str;
        audio_duration_seconds: Option<f32>;
        audio_source: &str;
    } => "transcription_failed",
    event_properties([
        ("stage", json!(stage)),
        ("mode", json!(mode)),
        ("model", json!(model)),
        ("reason", json!(reason)),
        ("audio_duration_seconds", json!(audio_duration_seconds)),
        ("audio_source", json!(audio_source)),
    ])
);

#[tauri::command]
pub fn track_onboarding_step_viewed(app: tauri::AppHandle<AppRuntime>, step: String) {
    enqueue(
        &app,
        "onboarding_step_viewed",
        json!({ "step": onboarding_step(&step) }),
    );
}

fn onboarding_step(step: &str) -> &str {
    match step {
        "welcome" | "import" | "model" | "model_downloading" | "permissions" | "done" => step,
        _ => "unknown",
    }
}

define_usage_event!(
    track_setting_changed {
        setting: &str;
        from_value: bool;
        to_value: bool;
    } => "settings_changed",
    event_properties([
        ("setting", json!(setting)),
        ("from_value", json!(from_value)),
        ("to_value", json!(to_value)),
    ])
);

#[derive(Debug, PartialEq, Eq)]
struct SettingChange {
    name: &'static str,
    from: bool,
    to: bool,
}

fn changed_settings(previous: &UserSettings, next: &UserSettings) -> Vec<SettingChange> {
    [
        ("llm_enabled", previous.llm_enabled, next.llm_enabled),
        (
            "cleanup_enabled",
            previous.cleanup_enabled,
            next.cleanup_enabled,
        ),
        (
            "edit_mode_enabled",
            previous.edit_mode_enabled,
            next.edit_mode_enabled,
        ),
        (
            "remote_speech_enabled",
            previous.remote_speech_enabled,
            next.remote_speech_enabled,
        ),
        (
            "auto_dictionary_enabled",
            previous.auto_dictionary_enabled,
            next.auto_dictionary_enabled,
        ),
    ]
    .into_iter()
    .filter(|(_, from, to)| from != to)
    .map(|(name, from, to)| SettingChange { name, from, to })
    .collect()
}

pub fn track_settings_changes(
    app: &tauri::AppHandle<AppRuntime>,
    previous: &UserSettings,
    next: &UserSettings,
) {
    for change in changed_settings(previous, next) {
        track_setting_changed(app, change.name, change.from, change.to);
    }
}

define_usage_event!(
    track_recording_failed {
        stage: &str;
        reason: &str;
        input: &str;
    } => "recording_failed",
    event_properties([
        ("stage", json!(stage)),
        ("reason", json!(reason)),
        ("input", json!(input)),
    ])
);

define_usage_event!(
    track_transcription_fallback {
        remote_model: &str;
        local_model: &str;
        reason: &str;
        outcome: &str;
    } => "transcription_fallback",
    event_properties([
        ("remote_model", json!(remote_model)),
        ("local_model", json!(local_model)),
        ("reason", json!(reason)),
        ("outcome", json!(outcome)),
    ])
);

define_usage_event!(
    track_model_downloaded {
        model: &str;
    } => "model_downloaded",
    event_properties([("model", json!(model))])
);

define_usage_event!(
    track_model_download_failed {
        model: &str;
        stage: &str;
        reason: &str;
    } => "model_download_failed",
    event_properties([
        ("model", json!(model)),
        ("stage", json!(stage)),
        ("reason", json!(reason)),
    ])
);

define_usage_event!(
    track_update_failed {
        source: &str;
        stage: &str;
        version: Option<&str>;
        reason: &str;
    } => "update_failed",
    event_properties([
        ("source", json!(source)),
        ("stage", json!(stage)),
        ("version", json!(version.unwrap_or("unknown"))),
        ("reason", json!(reason)),
    ])
);

#[derive(Debug, PartialEq, Eq)]
struct FrontendCrash {
    window: String,
    source: String,
    error_kind: String,
    fingerprint: String,
}

impl FrontendCrash {
    fn sanitize(window: &str, source: &str, error_kind: &str, fingerprint: &str) -> Self {
        Self {
            window: bounded_value(window, &["main", "toast", "settings"]).to_owned(),
            source: bounded_value(source, &["render", "window_error", "unhandled_rejection"])
                .to_owned(),
            error_kind: bounded_value(
                error_kind,
                &[
                    "Error",
                    "TypeError",
                    "RangeError",
                    "ReferenceError",
                    "SyntaxError",
                ],
            )
            .to_owned(),
            fingerprint: if fingerprint.len() <= 16
                && fingerprint
                    .chars()
                    .all(|character| character.is_ascii_hexdigit())
            {
                fingerprint.to_owned()
            } else {
                "unknown".to_owned()
            },
        }
    }
}

fn bounded_value<'a>(value: &'a str, allowed: &[&str]) -> &'a str {
    allowed
        .contains(&value)
        .then_some(value)
        .unwrap_or("unknown")
}

#[tauri::command]
pub fn report_frontend_crash(
    app: tauri::AppHandle<AppRuntime>,
    window_label: String,
    source: String,
    error_kind: String,
    fingerprint: String,
) {
    let crash = FrontendCrash::sanitize(&window_label, &source, &error_kind, &fingerprint);
    let diagnostics = crash_context(&app, &json!({ "crash_phase": "frontend" }));
    let mechanism = format!("frontend_{}", crash.source);
    ExceptionDraft {
        exception_type: &crash.error_kind,
        value: &crash.source,
        mechanism: &mechanism,
        fingerprint: &crash.fingerprint,
        frame: None,
        extra: json!({
            "window": crash.window,
            "source": crash.source,
            "error_kind": crash.error_kind,
            "fingerprint": crash.fingerprint,
            "diagnostics": diagnostics,
        }),
    }
    .capture(&app);
}

struct ClassificationRule {
    outcome: &'static str,
    indicators: &'static [&'static str],
}

const fn classification_rule(
    outcome: &'static str,
    indicators: &'static [&'static str],
) -> ClassificationRule {
    ClassificationRule {
        outcome,
        indicators,
    }
}

const PERMISSION_INDICATORS: &[&str] = &["permission", "not allowed", "access denied"];
const AUTHORIZATION_INDICATORS: &[&str] = &["unauthorized", "authentication", "api key"];

const FAILURE_RULES: &[ClassificationRule] = &[
    classification_rule("cancelled", &["cancel"]),
    classification_rule("permission", PERMISSION_INDICATORS),
    classification_rule("unauthorized", AUTHORIZATION_INDICATORS),
    classification_rule("rate_limited", &["rate limit", "too many requests"]),
    classification_rule("quota_exceeded", &["quota", "billing"]),
    classification_rule("timeout", &["timeout", "timed out"]),
    classification_rule("network", &["network", "connect", "dns"]),
    classification_rule("not_found", &["not found", "no such file"]),
    classification_rule("no_speech", &["no speech", "empty"]),
    classification_rule("model_error", &["model"]),
    classification_rule("decode", &["decode", "ffmpeg"]),
    classification_rule("verification", &["checksum", "verify"]),
    classification_rule("storage", &["disk", "write", "save", "storage"]),
    classification_rule("task_failed", &["task", "join"]),
];

pub fn classify_failure_reason(message: &str) -> &'static str {
    classify_by_rules(message, FAILURE_RULES, "unknown")
}

fn classify_by_rules(
    message: &str,
    rules: &'static [ClassificationRule],
    fallback: &'static str,
) -> &'static str {
    let normalized = message.to_ascii_lowercase();
    rules
        .iter()
        .find(|rule| {
            rule.indicators
                .iter()
                .any(|fragment| normalized.contains(fragment))
        })
        .map(|rule| rule.outcome)
        .unwrap_or(fallback)
}

pub fn track_onboarding_completed(app: &tauri::AppHandle<AppRuntime>) {
    enqueue(app, "onboarding_completed", json!({}));
}

pub fn track_app_exited(
    app: &tauri::AppHandle<AppRuntime>,
    uptime_seconds: f64,
    transcription_count: u32,
) {
    if let Some(event) = prepare_event(
        app,
        EventDraft::usage(
            "app_exited",
            json!({
                "uptime_seconds": uptime_seconds,
                "transcription_count": transcription_count,
            }),
        ),
    ) {
        posthog_rs::capture(event);
    }
    let _ = tauri::async_runtime::block_on(async {
        tokio::time::timeout(SHUTDOWN_LIMIT, posthog_rs::shutdown()).await
    });
}

pub fn install_crash_handler(marker_path: PathBuf, crash_log_path: Option<PathBuf>) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".to_owned());
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            });
        write_panic_artifacts(
            &marker_path,
            crash_log_path.as_deref(),
            &location,
            message,
            &chrono::Local::now().to_rfc3339(),
        );
        previous(panic_info);
    }));
}

fn write_panic_artifacts(
    marker_path: &Path,
    crash_log_path: Option<&Path>,
    location: &str,
    message: Option<&str>,
    when: &str,
) {
    let panic_kind = classify_panic(message);
    let marker = format!(
        "{APP_VERSION}\n{location}\n{panic_kind}\ncrash_phase={}\n",
        crash_phase()
    );
    let _ = std::fs::write(marker_path, marker);

    if let Some(path) = crash_log_path {
        let detail = message
            .unwrap_or("<non-string panic payload>")
            .chars()
            .take(2000)
            .collect::<String>();
        let local_log = format!(
            "Looper {APP_VERSION} crashed\n\
             # Stays on your device. May contain text you typed or file paths; review before sharing.\n\
             time: {when}\nlocation: {location}\ntype: {panic_kind}\nmessage: {detail}\n"
        );
        let _ = std::fs::write(path, local_log);
    }
}

const PANIC_RULES: &[ClassificationRule] = &[
    classification_rule("out_of_memory", &["memory allocation", "out of memory"]),
    classification_rule("assertion", &["assertion"]),
    classification_rule("unwrap_or_expect", &["unwrap()", "expect("]),
    classification_rule("bounds_check", &["index out of bounds"]),
];

fn classify_panic(message: Option<&str>) -> &'static str {
    message
        .map(|message| classify_by_rules(message, PANIC_RULES, "string_panic"))
        .unwrap_or("non_string_panic")
}

pub fn report_pending_crash(app: &tauri::AppHandle<AppRuntime>, marker_path: &Path) {
    let Ok(contents) = std::fs::read_to_string(marker_path) else {
        return;
    };
    let _ = std::fs::remove_file(marker_path);
    let marker = CrashMarker::parse(&contents);
    let diagnostics = crash_context(app, &marker.payload);
    let extra = merge_json_objects(
        marker.payload,
        json!({
            "location": marker.location_key,
            "location_hash": stable_hash(&marker.location_key),
            "raw_location_kind": if marker.raw_location == marker.location_key {
                "unchanged"
            } else {
                "sanitized"
            },
            "diagnostics": diagnostics,
        }),
    );
    ExceptionDraft {
        exception_type: &marker.crash_type,
        value: &marker.location_key,
        mechanism: marker.mechanism,
        fingerprint: &marker.fingerprint,
        frame: Some(crash_frame(&marker.location_key, &marker.crash_type)),
        extra,
    }
    .capture(app);
}

struct CrashMarker {
    payload: Value,
    crash_type: String,
    raw_location: String,
    location_key: String,
    mechanism: &'static str,
    fingerprint: String,
}

impl CrashMarker {
    fn parse(contents: &str) -> Self {
        let payload = parse_crash_marker(contents);
        let crash_type = string_property(&payload, "crash_type");
        let raw_location = string_property(&payload, "location");
        let location_key = sanitized_crash_location(&raw_location, &crash_type);
        let (mechanism, fingerprint) = if crash_type == "native" {
            (
                "native_crash",
                format!(
                    "native:{}:{}",
                    payload
                        .get("faulting_module")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown"),
                    payload
                        .get("exception_code")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown")
                ),
            )
        } else {
            ("rust_panic", format!("{crash_type}:{location_key}"))
        };
        Self {
            payload,
            crash_type,
            raw_location,
            location_key,
            mechanism,
            fingerprint,
        }
    }
}

fn string_property(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_owned()
}

fn merge_json_objects(mut base: Value, extra: Value) -> Value {
    let Some(base_properties) = base.as_object_mut() else {
        return extra;
    };
    if let Some(extra_properties) = extra.as_object() {
        base_properties.extend(
            extra_properties
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    base
}

fn sanitized_crash_location(location: &str, crash_type: &str) -> String {
    if crash_type == "native" {
        return location.to_owned();
    }
    match location.rsplit_once(':') {
        Some((path, line)) if line.parse::<u32>().is_ok() => {
            format!("{}:{line}", path_tail(path))
        }
        _ => path_tail(location),
    }
}

fn path_tail(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .next()
        .filter(|component| !component.is_empty())
        .unwrap_or("unknown")
        .to_owned()
}

fn stable_hash(value: &str) -> String {
    let hash = value
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    format!("{hash:016x}")
}

fn crash_frame(location: &str, crash_type: &str) -> Value {
    if crash_type == "native" {
        return json!({
            "filename": location,
            "function": "<native>",
            "lang": "native",
            "platform": "native",
            "in_app": true,
            "synthetic": true,
            "resolved": false,
        });
    }
    let (filename, line_number) = location
        .rsplit_once(':')
        .and_then(|(file, line)| line.parse::<u32>().ok().map(|number| (file, Some(number))))
        .unwrap_or((location, None));
    let mut frame = json!({
        "filename": filename,
        "function": crash_type,
        "lang": "rust",
        "platform": "rust",
        "in_app": true,
        "synthetic": true,
        "resolved": true,
    });
    if let Some(line_number) = line_number {
        frame["lineno"] = json!(line_number);
    }
    frame
}

fn parse_crash_marker(contents: &str) -> Value {
    let mut lines = contents.lines();
    let mut properties = serde_json::Map::from_iter([
        (
            "crashed_version".to_owned(),
            json!(lines.next().unwrap_or("unknown")),
        ),
        (
            "location".to_owned(),
            json!(lines.next().unwrap_or("unknown")),
        ),
        (
            "crash_type".to_owned(),
            json!(lines.next().unwrap_or("unknown")),
        ),
    ]);
    for line in lines {
        if let Some((key, value)) = line.split_once('=') {
            properties.insert(key.trim().to_owned(), json!(value.trim()));
        }
    }
    Value::Object(properties)
}

#[cfg(test)]
#[path = "analytics_tests.rs"]
mod tests;
