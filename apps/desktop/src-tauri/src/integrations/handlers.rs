//! Application-side execution for requests received on the local control channel.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::ipc::{Request, Response};
use crate::library::{
    LibraryImportOptions, MeetingCapturePhase, MeetingCaptureState, MeetingStartOptions,
};
use crate::settings::{Replacement, UserSettings};
use crate::{AppRuntime, AppState};

pub(crate) fn dispatch(app: &AppHandle<AppRuntime>, request: &Request) -> Response {
    let result = CommandRoute::recognize(&request.command)
        .and_then(|route| route.invoke(app, &request.args));
    response_for(result)
}

fn response_for(result: Result<Value, String>) -> Response {
    match result {
        Ok(data) => Response::ok(data),
        Err(message) => Response::error(message),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CommandRoute {
    Ping,
    DictionaryAdd,
    DictionaryRemove,
    ReplacementAdd,
    ReplacementRemove,
    ModelSet,
    Open,
    Status,
    LibraryImport,
    MeetingStart,
    MeetingStatus,
    MeetingNote,
    MeetingStop,
    Transcribe,
    CleanupTranscript,
    #[cfg(debug_assertions)]
    QaRun,
    #[cfg(debug_assertions)]
    QaShowResult,
}

impl CommandRoute {
    fn recognize(command: &str) -> Result<Self, String> {
        match command {
            "ping" => Ok(Self::Ping),
            "dictionary.add" => Ok(Self::DictionaryAdd),
            "dictionary.remove" => Ok(Self::DictionaryRemove),
            "replacements.add" => Ok(Self::ReplacementAdd),
            "replacements.remove" => Ok(Self::ReplacementRemove),
            "model.set" => Ok(Self::ModelSet),
            "open" => Ok(Self::Open),
            "status" => Ok(Self::Status),
            "library.import" => Ok(Self::LibraryImport),
            "meeting.start" => Ok(Self::MeetingStart),
            "meeting.status" => Ok(Self::MeetingStatus),
            "meeting.note" => Ok(Self::MeetingNote),
            "meeting.stop" => Ok(Self::MeetingStop),
            "transcribe" => Ok(Self::Transcribe),
            "transcribe.cleanup" => Ok(Self::CleanupTranscript),
            #[cfg(debug_assertions)]
            "qa.run" => Ok(Self::QaRun),
            #[cfg(debug_assertions)]
            "qa.show-result" => Ok(Self::QaShowResult),
            other => Err(format!("Unknown command: {other}")),
        }
    }

    fn invoke(self, app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
        match self {
            Self::Ping => Ok(json!({ "pong": true })),
            Self::DictionaryAdd => edit_dictionary(app, args, DictionaryEditKind::Add),
            Self::DictionaryRemove => edit_dictionary(app, args, DictionaryEditKind::Remove),
            Self::ReplacementAdd => edit_replacements(app, args, ReplacementEditKind::Add),
            Self::ReplacementRemove => edit_replacements(app, args, ReplacementEditKind::Remove),
            Self::ModelSet => set_model(app, args),
            Self::Open => open_window(app, args),
            Self::Status => runtime_status(app),
            Self::LibraryImport => import_library_item(app, args),
            Self::MeetingStart => start_meeting(app, args),
            Self::MeetingStatus => meeting_status(app),
            Self::MeetingNote => capture_meeting_note(app),
            Self::MeetingStop => stop_meeting(app),
            Self::Transcribe => transcribe_file(app, args),
            Self::CleanupTranscript => cleanup_transcript(app, args),
            #[cfg(debug_assertions)]
            Self::QaRun => qa_run(app, args),
            #[cfg(debug_assertions)]
            Self::QaShowResult => qa_show_result(app, args),
        }
    }
}

#[derive(Clone, Copy)]
struct Payload<'a>(&'a Value);

impl<'a> Payload<'a> {
    fn required_string(self, key: &str) -> Result<String, String> {
        self.string(key)
            .map(str::to_owned)
            .ok_or_else(|| format!("missing string argument `{key}`"))
    }

    fn required_strings(self, key: &str) -> Result<Vec<String>, String> {
        self.0
            .get(key)
            .and_then(Value::as_array)
            .ok_or_else(|| format!("missing array argument `{key}`"))?
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| format!("`{key}` must contain only strings"))
            })
            .collect()
    }

    fn string(self, key: &str) -> Option<&'a str> {
        self.0.get(key).and_then(Value::as_str)
    }

    fn boolean(self, key: &str) -> Option<bool> {
        self.0.get(key).and_then(Value::as_bool)
    }
}

fn require_license(state: &AppState) -> Result<(), String> {
    crate::license::require_active_license(&state.settings_store, "the Looper CLI")
}

#[derive(Clone, Copy)]
enum DictionaryEditKind {
    Add,
    Remove,
}

struct DictionaryEdit {
    kind: DictionaryEditKind,
    words: Vec<String>,
}

impl DictionaryEdit {
    fn parse(args: &Value, kind: DictionaryEditKind) -> Result<Self, String> {
        let words = Payload(args).required_strings("words")?;
        Ok(Self { kind, words })
    }

    fn apply(self, mut existing: Vec<String>) -> Vec<String> {
        match self.kind {
            DictionaryEditKind::Add => existing.extend(self.words),
            DictionaryEditKind::Remove => {
                let removals = self
                    .words
                    .into_iter()
                    .map(|word| word.to_lowercase())
                    .collect::<Vec<_>>();
                existing.retain(|word| !removals.contains(&word.to_lowercase()));
            }
        }
        existing
    }
}

fn edit_dictionary(
    app: &AppHandle<AppRuntime>,
    args: &Value,
    kind: DictionaryEditKind,
) -> Result<Value, String> {
    let edit = DictionaryEdit::parse(args, kind)?;
    let state = app.state::<AppState>();
    require_license(&state)?;
    let current = state.current_settings_unmasked().dictionary;
    let saved = crate::dictionary::set_dictionary(edit.apply(current), app.clone(), state)?;
    Ok(json!({ "words": saved }))
}

#[derive(Clone, Copy)]
enum ReplacementEditKind {
    Add,
    Remove,
}

enum ReplacementEdit {
    Add(Replacement),
    Remove(String),
}

impl ReplacementEdit {
    fn parse(args: &Value, kind: ReplacementEditKind) -> Result<Self, String> {
        let payload = Payload(args);
        let from = payload.required_string("from")?;
        match kind {
            ReplacementEditKind::Add => Ok(Self::Add(Replacement {
                from,
                to: payload.required_string("to")?,
            })),
            ReplacementEditKind::Remove => Ok(Self::Remove(from)),
        }
    }

    fn apply(self, mut current: Vec<Replacement>) -> Vec<Replacement> {
        let source = match &self {
            Self::Add(replacement) => &replacement.from,
            Self::Remove(source) => source,
        };
        current.retain(|replacement| !replacement.from.eq_ignore_ascii_case(source));
        if let Self::Add(replacement) = self {
            current.push(replacement);
        }
        current
    }
}

fn edit_replacements(
    app: &AppHandle<AppRuntime>,
    args: &Value,
    kind: ReplacementEditKind,
) -> Result<Value, String> {
    let edit = ReplacementEdit::parse(args, kind)?;
    let state = app.state::<AppState>();
    require_license(&state)?;
    let current = state.current_settings_unmasked().replacements;
    let saved = crate::dictionary::set_replacements(edit.apply(current), app.clone(), state)?;
    Ok(json!({ "replacements": saved }))
}

#[derive(Debug, PartialEq, Eq)]
enum ModelSelection {
    Remote,
    Local(String),
}

impl ModelSelection {
    fn parse(args: &Value) -> Result<Self, String> {
        let payload = Payload(args);
        match payload.required_string("target")?.as_str() {
            "remote" => Ok(Self::Remote),
            "local" => Ok(Self::Local(payload.required_string("model")?)),
            other => Err(format!("Unknown model target: {other}")),
        }
    }

    fn activate(self, app: &AppHandle<AppRuntime>) -> Result<(), String> {
        match self {
            Self::Remote => crate::speech::menu::cli_enable_remote(app),
            Self::Local(model) => crate::speech::menu::cli_set_local_model(app, &model),
        }
    }
}

fn set_model(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    require_license(&app.state::<AppState>())?;
    ModelSelection::parse(args)?.activate(app)?;
    let settings = app.state::<AppState>().current_settings_unmasked();
    Ok(json!({
        "active": active_model(&settings),
        "remote_enabled": settings.remote_speech_enabled,
    }))
}

fn active_model(settings: &UserSettings) -> &str {
    if settings.remote_speech_enabled {
        "remote"
    } else {
        &settings.local_model
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WindowRoute {
    History,
    Models,
    About,
    Default,
}

impl WindowRoute {
    fn choose(target: &str, tab: Option<&str>) -> Self {
        match (target, tab) {
            ("history", _) | ("settings", Some("history")) => Self::History,
            ("models", _) | ("settings", Some("models")) => Self::Models,
            ("settings", Some("about")) => Self::About,
            _ => Self::Default,
        }
    }

    fn open(self, app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
        match self {
            Self::History => crate::tray::open_settings_history(app),
            Self::Models => crate::tray::open_settings_models(app),
            Self::About => crate::tray::open_settings_about(app),
            Self::Default => crate::tray::toggle_settings_window(app),
        }
    }
}

fn open_window(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let payload = Payload(args);
    let target = payload.string("target").unwrap_or("settings");
    WindowRoute::choose(target, payload.string("tab"))
        .open(app)
        .map_err(|error| error.to_string())?;
    Ok(json!({ "opened": target }))
}

fn runtime_status(app: &AppHandle<AppRuntime>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let settings = state.current_settings_unmasked();
    let pill = serde_json::to_value(state.pill().status()).unwrap_or(Value::Null);
    Ok(json!({
        "app_running": true,
        "pill": pill,
        "active_model": active_model(&settings),
        "remote_enabled": settings.remote_speech_enabled,
        "capture_pill": {
            "presentation": settings.capture_pill_presentation,
            "dock_position": settings.capture_pill_dock_position,
        },
    }))
}

fn library_options(args: &Value, settings: &UserSettings) -> LibraryImportOptions {
    let payload = Payload(args);
    LibraryImportOptions {
        store_original: payload.boolean("store_original").unwrap_or(false),
        model_key: payload
            .string("model")
            .map(str::to_owned)
            .unwrap_or_else(|| settings.local_model.clone()),
        llm_cleanup_enabled: payload
            .boolean("llm_cleanup")
            .unwrap_or(settings.cleanup_enabled),
        denoise_enabled: payload.boolean("denoise").unwrap_or(false),
        show_timestamps: payload.boolean("show_timestamps").unwrap_or(false),
        detect_speakers: payload.boolean("detect_speakers").unwrap_or(false),
    }
}

fn import_library_item(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let path = Payload(args).required_string("path")?;
    let state = app.state::<AppState>();
    require_license(&state)?;
    let options = library_options(args, &state.current_settings_unmasked());
    let item = crate::library::commands::create_library_item(path, options, app.clone(), state)?;
    Ok(json!({
        "id": item.id,
        "name": item.name,
        "source_path": item.source_path,
        "status": "pending",
    }))
}

#[derive(Debug, PartialEq, Eq)]
struct MeetingPreferences {
    model: Option<String>,
    system_audio_enabled: bool,
}

impl MeetingPreferences {
    fn parse(args: &Value) -> Self {
        let payload = Payload(args);
        Self {
            model: payload.string("model").map(str::to_owned),
            system_audio_enabled: payload.boolean("system_audio_enabled").unwrap_or(true),
        }
    }

    fn resolve(
        self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
    ) -> Result<MeetingStartOptions, String> {
        let model_key = match self.model {
            Some(model) => model,
            None => crate::library::meeting_commands::default_meeting_model(app, settings)?,
        };
        Ok(MeetingStartOptions {
            model_key,
            live_model_key: None,
            system_audio_enabled: self.system_audio_enabled,
            calendar_context: None,
        })
    }
}

fn start_meeting(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let state = app.state::<AppState>();
    crate::library::meeting_commands::require_meeting_license(&state)?;
    let settings = state.current_settings_unmasked();
    let options = MeetingPreferences::parse(args).resolve(app, &settings)?;
    let capture =
        tauri::async_runtime::block_on(state.meeting_capture().start(app, &state, options))?;
    serde_json::to_value(capture).map_err(|error| error.to_string())
}

fn meeting_status(app: &AppHandle<AppRuntime>) -> Result<Value, String> {
    serde_json::to_value(app.state::<AppState>().meeting_capture().state())
        .map_err(|error| error.to_string())
}

fn capture_meeting_note(app: &AppHandle<AppRuntime>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    crate::library::meeting_commands::require_meeting_license(&state)?;
    let marker = state.meeting_capture().capture_note(app, &state)?;
    serde_json::to_value(marker).map_err(|error| error.to_string())
}

fn stop_meeting(app: &AppHandle<AppRuntime>) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let capture = tauri::async_runtime::block_on(state.meeting_capture().stop(app, &state))?;
    meeting_stop_response(capture)
}

fn meeting_stop_response(capture: MeetingCaptureState) -> Result<Value, String> {
    if capture.phase == MeetingCapturePhase::Error {
        return Err(capture
            .error
            .unwrap_or_else(|| "Meeting capture failed.".to_string()));
    }
    serde_json::to_value(capture).map_err(|error| error.to_string())
}

struct TranscriptionRequest {
    path: String,
    model: String,
    language: String,
    cleanup: bool,
}

impl TranscriptionRequest {
    fn parse(path: String, args: &Value, settings: &UserSettings) -> Self {
        let payload = Payload(args);
        Self {
            path,
            model: payload
                .string("model")
                .map(str::to_owned)
                .unwrap_or_else(|| settings.local_model.clone()),
            language: payload
                .string("language")
                .map(str::to_owned)
                .unwrap_or_else(|| settings.language.clone()),
            cleanup: payload
                .boolean("cleanup")
                .unwrap_or(settings.cleanup_enabled),
        }
    }
}

struct DecodedAudio {
    samples: Vec<i16>,
    sample_rate: u32,
}

impl DecodedAudio {
    fn load(path: &str) -> Result<Self, String> {
        let (samples, sample_rate) = decode_audio(path)?;
        Ok(Self {
            samples,
            sample_rate,
        })
    }

    fn duration_seconds(&self) -> f64 {
        match self.sample_rate {
            0 => 0.0,
            rate => self.samples.len() as f64 / rate as f64,
        }
    }
}

struct CleanedText {
    text: String,
    applied: bool,
}

impl CleanedText {
    fn untouched(text: String) -> Self {
        Self {
            text,
            applied: false,
        }
    }
}

fn cleanup_with_llm(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    settings: &UserSettings,
    text: String,
) -> CleanedText {
    if !crate::llm_cleanup::is_llm_available(settings) {
        return CleanedText::untouched(text);
    }

    let http = state.http();
    match tauri::async_runtime::block_on(crate::llm_cleanup::cleanup_transcription(
        app, &http, &text, settings, None, None,
    )) {
        Ok(cleaned) => CleanedText {
            text: cleaned,
            applied: true,
        },
        Err(error) => {
            tracing::warn!("CLI transcribe cleanup skipped: {error}");
            CleanedText::untouched(text)
        }
    }
}

fn apply_text_preferences(text: &str, settings: &UserSettings) -> String {
    let replaced = crate::dictionary::apply_replacements(text, &settings.replacements);
    crate::user_snippets::apply_user_snippets(&replaced, &settings.user_snippets)
}

fn transcribe_file(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let path = Payload(args).required_string("path")?;
    let state = app.state::<AppState>();
    require_license(&state)?;
    let settings = state.current_settings_unmasked();
    let request = TranscriptionRequest::parse(path, args, &settings);

    let model = crate::speech::install::ensure_model_ready(app, &request.model)
        .map_err(|error| format!("Failed to load model {}: {error}", request.model))?;
    let audio = DecodedAudio::load(&request.path)?;
    let dictionary = crate::dictionary::dictionary_entries_for_model(&model, &settings);
    let success = state
        .local_transcriber()
        .transcribe_with_segments(
            &model,
            &audio.samples,
            audio.sample_rate,
            &dictionary,
            Some(&request.language),
        )
        .map_err(|error| format!("Transcription failed: {error}"))?;

    let text = apply_text_preferences(&success.transcript, &settings);
    let output = if request.cleanup {
        cleanup_with_llm(app, &state, &settings, text)
    } else {
        CleanedText::untouched(text)
    };
    let word_count = output.text.split_whitespace().count();

    Ok(json!({
        "text": output.text,
        "speech_model": success.speech_model,
        "llm_cleaned": output.applied,
        "word_count": word_count,
        "duration_seconds": audio.duration_seconds(),
    }))
}

fn cleanup_transcript(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let text = Payload(args).required_string("text")?;
    let state = app.state::<AppState>();
    require_license(&state)?;
    let settings = state.current_settings_unmasked();
    let output = cleanup_with_llm(app, &state, &settings, text);
    Ok(json!({
        "text": output.text,
        "llm_cleaned": output.applied,
    }))
}

static NEXT_DECODE_TEMP: AtomicU64 = AtomicU64::new(0);

struct DecodeScratch(PathBuf);

impl DecodeScratch {
    fn allocate() -> Self {
        Self(std::env::temp_dir().join(format!(
            "looper-transcribe-{}-{}.wav",
            std::process::id(),
            NEXT_DECODE_TEMP.fetch_add(1, Ordering::Relaxed)
        )))
    }
}

impl Drop for DecodeScratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn decode_audio(path: &str) -> Result<(Vec<i16>, u32), String> {
    let source = Path::new(path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension == "wav" {
        return load_wav(source);
    }

    let scratch = DecodeScratch::allocate();
    crate::library::convert_to_wav(source, &scratch.0, &extension, None, None, None)
        .map_err(|error| format!("Failed to decode audio: {error}"))?;
    load_wav(&scratch.0)
}

fn load_wav(path: &Path) -> Result<(Vec<i16>, u32), String> {
    crate::transcribe::load_audio_for_transcription(path)
        .map_err(|error| format!("Failed to decode audio: {error}"))
}

#[cfg(debug_assertions)]
fn qa_run(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let action = Payload(args).required_string("action")?;
    if crate::qa_lab::handle_menu_event(app, &action) {
        Ok(json!({ "action": action }))
    } else {
        Err(format!("Unknown QA action: {action}"))
    }
}

#[cfg(debug_assertions)]
fn qa_show_result(app: &AppHandle<AppRuntime>, args: &Value) -> Result<Value, String> {
    let text = Payload(args).required_string("text")?;
    crate::transcribe::show_result_for_qa(app, text)?;
    Ok(json!({ "shown": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_table_preserves_commands_and_unknown_error_text() {
        let cases = [
            ("ping", CommandRoute::Ping),
            ("dictionary.add", CommandRoute::DictionaryAdd),
            ("replacements.remove", CommandRoute::ReplacementRemove),
            ("model.set", CommandRoute::ModelSet),
            ("library.import", CommandRoute::LibraryImport),
            ("meeting.stop", CommandRoute::MeetingStop),
            ("transcribe.cleanup", CommandRoute::CleanupTranscript),
        ];
        for (wire, expected) in cases {
            assert_eq!(CommandRoute::recognize(wire).unwrap(), expected);
        }
        assert_eq!(
            CommandRoute::recognize("missing").unwrap_err(),
            "Unknown command: missing"
        );
    }

    #[test]
    fn response_wrapper_keeps_success_and_error_wire_shapes() {
        assert_eq!(
            serde_json::to_value(response_for(Ok(json!({ "pong": true })))).unwrap(),
            json!({ "ok": true, "data": { "pong": true } })
        );
        assert_eq!(
            serde_json::to_value(response_for(Err("denied".to_owned()))).unwrap(),
            json!({ "ok": false, "error": "denied" })
        );
    }

    #[test]
    fn meeting_stop_reports_capture_errors_without_breaking_idempotent_states() {
        let failed = MeetingCaptureState {
            phase: MeetingCapturePhase::Error,
            error: Some("Timed out waiting for microphone permission".to_string()),
            ..Default::default()
        };
        assert_eq!(
            meeting_stop_response(failed).unwrap_err(),
            "Timed out waiting for microphone permission"
        );

        let idle = meeting_stop_response(MeetingCaptureState::default()).unwrap();
        assert_eq!(idle["phase"], "idle");

        let processing = meeting_stop_response(MeetingCaptureState {
            phase: MeetingCapturePhase::Processing,
            ..Default::default()
        })
        .unwrap();
        assert_eq!(processing["phase"], "processing");
    }

    #[test]
    fn payload_validation_distinguishes_missing_arrays_and_invalid_members() {
        assert_eq!(
            Payload(&json!({})).required_string("path").unwrap_err(),
            "missing string argument `path`"
        );
        assert_eq!(
            Payload(&json!({ "words": "one" }))
                .required_strings("words")
                .unwrap_err(),
            "missing array argument `words`"
        );
        assert_eq!(
            Payload(&json!({ "words": ["one", 2] }))
                .required_strings("words")
                .unwrap_err(),
            "`words` must contain only strings"
        );
    }

    #[test]
    fn dictionary_edits_keep_order_and_case_insensitive_removal() {
        let added = DictionaryEdit::parse(
            &json!({ "words": ["Gamma", "alpha"] }),
            DictionaryEditKind::Add,
        )
        .unwrap()
        .apply(vec!["Beta".to_owned()]);
        assert_eq!(added, ["Beta", "Gamma", "alpha"]);

        let removed =
            DictionaryEdit::parse(&json!({ "words": ["ALPHA"] }), DictionaryEditKind::Remove)
                .unwrap()
                .apply(added);
        assert_eq!(removed, ["Beta", "Gamma"]);
    }

    #[test]
    fn replacement_add_overwrites_in_place_then_appends_and_remove_matches_ascii_case() {
        let current = vec![
            Replacement {
                from: "teh".to_owned(),
                to: "old".to_owned(),
            },
            Replacement {
                from: "keep".to_owned(),
                to: "value".to_owned(),
            },
        ];
        let updated = ReplacementEdit::parse(
            &json!({ "from": "TEH", "to": "the" }),
            ReplacementEditKind::Add,
        )
        .unwrap()
        .apply(current);
        assert_eq!(updated[0].from, "keep");
        assert_eq!(updated[1].to, "the");

        let removed =
            ReplacementEdit::parse(&json!({ "from": "Keep" }), ReplacementEditKind::Remove)
                .unwrap()
                .apply(updated);
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].from, "TEH");
    }

    #[test]
    fn model_and_window_policies_preserve_defaults_and_routing() {
        assert_eq!(
            ModelSelection::parse(&json!({ "target": "remote" })).unwrap(),
            ModelSelection::Remote
        );
        assert_eq!(
            ModelSelection::parse(&json!({ "target": "local", "model": "parakeet" })).unwrap(),
            ModelSelection::Local("parakeet".to_owned())
        );
        assert_eq!(
            ModelSelection::parse(&json!({ "target": "cloud" })).unwrap_err(),
            "Unknown model target: cloud"
        );
        assert_eq!(
            WindowRoute::choose("history", Some("models")),
            WindowRoute::History
        );
        assert_eq!(
            WindowRoute::choose("settings", Some("models")),
            WindowRoute::Models
        );
        assert_eq!(
            WindowRoute::choose("settings", Some("about")),
            WindowRoute::About
        );
        assert_eq!(WindowRoute::choose("library", None), WindowRoute::Default);
    }

    #[test]
    fn library_and_meeting_options_retain_settings_fallbacks() {
        let mut settings = UserSettings::default();
        settings.local_model = "configured-model".to_owned();
        settings.cleanup_enabled = true;
        let defaults = library_options(&json!({}), &settings);
        assert_eq!(
            defaults,
            LibraryImportOptions {
                store_original: false,
                model_key: "configured-model".to_owned(),
                llm_cleanup_enabled: true,
                denoise_enabled: false,
                show_timestamps: false,
                detect_speakers: false,
            }
        );
        let explicit = library_options(
            &json!({
                "store_original": true,
                "model": "other",
                "llm_cleanup": false,
                "denoise": true,
                "show_timestamps": true,
                "detect_speakers": true,
            }),
            &settings,
        );
        assert!(explicit.store_original);
        assert_eq!(explicit.model_key, "other");
        assert!(!explicit.llm_cleanup_enabled);
        assert!(explicit.denoise_enabled && explicit.show_timestamps && explicit.detect_speakers);

        assert_eq!(
            MeetingPreferences::parse(&json!({})),
            MeetingPreferences {
                model: None,
                system_audio_enabled: true,
            }
        );
        assert_eq!(
            MeetingPreferences::parse(&json!({
                "model": "meeting-model",
                "system_audio_enabled": false,
            })),
            MeetingPreferences {
                model: Some("meeting-model".to_owned()),
                system_audio_enabled: false,
            }
        );
    }

    #[test]
    fn transcription_options_and_text_preferences_preserve_defaults_and_order() {
        let mut settings = UserSettings::default();
        settings.local_model = "local".to_owned();
        settings.language = "es".to_owned();
        settings.cleanup_enabled = true;
        settings.replacements = vec![Replacement {
            from: "hola".to_owned(),
            to: "buenas".to_owned(),
        }];
        settings.user_snippets = vec![crate::settings::UserSnippet {
            trigger: "firma".to_owned(),
            expansion: "James".to_owned(),
        }];

        let request = TranscriptionRequest::parse("voice.wav".to_owned(), &json!({}), &settings);
        assert_eq!(
            (
                request.path.as_str(),
                request.model.as_str(),
                request.language.as_str(),
                request.cleanup
            ),
            ("voice.wav", "local", "es", true)
        );
        assert_eq!(
            apply_text_preferences("hola firma", &settings),
            "buenas James"
        );
    }

    #[test]
    fn wav_decode_contract_keeps_samples_rate_duration_and_error_prefix() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.WAV");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        writer.write_sample(100_i16).unwrap();
        writer.write_sample(-100_i16).unwrap();
        writer.finalize().unwrap();

        let decoded = DecodedAudio::load(path.to_str().unwrap()).unwrap();
        assert_eq!(decoded.samples, [100, -100]);
        assert_eq!(decoded.sample_rate, 16_000);
        assert_eq!(decoded.duration_seconds(), 2.0 / 16_000.0);

        let error = DecodedAudio::load(directory.path().join("missing.wav").to_str().unwrap())
            .err()
            .unwrap();
        assert!(error.starts_with("Failed to decode audio: "));
    }
}
