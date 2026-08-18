use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use reqwest::Client;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{oneshot, Notify};
use tokio_util::sync::CancellationToken;

use super::contracts::{AppRuntime, LibraryJob, LooperResult, EVENT_SETTINGS_CHANGED};
use crate::pill::PillController;
use crate::recorder::RecorderManager;
use crate::settings::{SettingsStore, UserSettings};
use crate::{
    assistive, core, library, license, llm_cleanup, local_llm, local_transcription,
    meeting_awareness, model_manager, selection_actions, storage, streaming_transcription,
    transcribe, update_checker,
};

struct DecisionGate<T>(Mutex<Option<oneshot::Sender<T>>>);

impl<T> Default for DecisionGate<T> {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

impl<T> DecisionGate<T> {
    fn open(&self) -> oneshot::Receiver<T> {
        let (sender, receiver) = oneshot::channel();
        self.0.lock().replace(sender);
        receiver
    }

    fn resolve(&self, value: T) -> bool {
        self.0
            .lock()
            .take()
            .is_some_and(|sender| sender.send(value).is_ok())
    }

    fn clear(&self) {
        self.0.lock().take();
    }
}

#[derive(Default)]
struct TokenRegistry(Mutex<HashMap<String, CancellationToken>>);

impl TokenRegistry {
    fn replace(&self, key: String) -> CancellationToken {
        let token = CancellationToken::new();
        self.0.lock().insert(key, token.clone());
        token
    }

    fn find_or_create(&self, key: String) -> CancellationToken {
        let mut registry = self.0.lock();
        registry
            .entry(key)
            .or_insert_with(CancellationToken::new)
            .clone()
    }

    fn cancel_and_remove(&self, key: &str) -> bool {
        self.0.lock().remove(key).is_some_and(|token| {
            token.cancel();
            true
        })
    }

    fn cancel(&self, key: &str) {
        if let Some(token) = self.0.lock().get(key) {
            token.cancel();
        }
    }

    fn remove(&self, key: &str) {
        self.0.lock().remove(key);
    }

    fn contains(&self, key: &str) -> bool {
        self.0.lock().contains_key(key)
    }

    fn is_empty(&self) -> bool {
        self.0.lock().is_empty()
    }
}

struct SettingsRuntime {
    current: Mutex<UserSettings>,
    cloud_token: Mutex<Option<String>>,
    shortcut_capture: AtomicBool,
    start_hidden: bool,
}

struct RecordingRuntime {
    cancelled: AtomicBool,
    cancellation: Mutex<Option<CancellationToken>>,
    ffmpeg_notice_sent: AtomicBool,
    pending_path: Mutex<Option<PathBuf>>,
    selected_text: Mutex<Option<String>>,
    screen_terms: Mutex<Option<async_runtime::JoinHandle<Vec<String>>>>,
    stream: Mutex<Option<streaming_transcription::StreamingSession>>,
    insertion: DecisionGate<transcribe::InsertionDecision>,
    last_insertion: Mutex<Option<assistive::UndoState>>,
    edit_action: DecisionGate<transcribe::EditActionDecision>,
    voice_preset: Mutex<Option<selection_actions::TransformPreset>>,
}

impl Default for RecordingRuntime {
    fn default() -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            cancellation: Mutex::new(None),
            ffmpeg_notice_sent: AtomicBool::new(false),
            pending_path: Mutex::new(None),
            selected_text: Mutex::new(None),
            screen_terms: Mutex::new(None),
            stream: Mutex::new(None),
            insertion: DecisionGate::default(),
            last_insertion: Mutex::new(None),
            edit_action: DecisionGate::default(),
            voice_preset: Mutex::new(None),
        }
    }
}

#[derive(Default)]
struct LibraryRuntime {
    tokens: TokenRegistry,
    pending: Mutex<VecDeque<LibraryJob>>,
    active_id: Mutex<Option<String>>,
}

struct BackgroundRuntime {
    retry_tokens: TokenRegistry,
    update_state: update_checker::SharedUpdateState,
    auto_update_completed: AtomicBool,
    preflight_cancel: CancellationToken,
    preflight_started: AtomicBool,
    preflight_notify: Arc<Notify>,
    session_started_at: Instant,
    transcription_count: Mutex<u32>,
}

impl Default for BackgroundRuntime {
    fn default() -> Self {
        Self {
            retry_tokens: TokenRegistry::default(),
            update_state: update_checker::create_state(),
            auto_update_completed: AtomicBool::new(false),
            preflight_cancel: CancellationToken::new(),
            preflight_started: AtomicBool::new(false),
            preflight_notify: Arc::new(Notify::new()),
            session_started_at: Instant::now(),
            transcription_count: Mutex::new(0),
        }
    }
}

pub struct AppState {
    pill: Arc<PillController>,
    http: Client,
    storage: Arc<storage::StorageManager>,
    settings: SettingsRuntime,
    recording: RecordingRuntime,
    downloads: TokenRegistry,
    local_llm_verifying: AtomicBool,
    library: LibraryRuntime,
    background: BackgroundRuntime,
    meeting_capture: library::MeetingCaptureManager,
    meeting_awareness: meeting_awareness::MeetingAwarenessManager,
    pub(crate) local_transcriber: Arc<local_transcription::LocalTranscriber>,
    pub(crate) local_llm_runtime: Arc<local_llm::LocalLlmRuntime>,
    pub(crate) settings_store: Arc<SettingsStore>,
    pub(crate) hotkeys: core::hotkeys::HotkeyCoordinator,
    pub(crate) tray: Mutex<Option<tauri::tray::TrayIcon<AppRuntime>>>,
    pub(crate) settings_close_handler_registered: AtomicBool,
}

impl AppState {
    pub fn new(
        settings_store: Arc<SettingsStore>,
        settings: UserSettings,
        app: &AppHandle<AppRuntime>,
    ) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .expect("Failed to build HTTP client");
        let database = app
            .path()
            .app_data_dir()
            .expect("Failed to resolve app data directory")
            .join("transcriptions.db");
        let storage = storage::StorageManager::new(database)
            .expect("Failed to initialize transcription storage");
        let recorder = Arc::new(RecorderManager::new());
        let launched_at_login = std::env::args_os().any(|arg| arg == "--autostart");
        let cache = model_manager::model_cache_dir(app)
            .expect("Failed to resolve local model cache directory");
        let transcriber = Arc::new(local_transcription::LocalTranscriber::new(cache));
        transcriber.start_idle_monitor();

        Self {
            pill: Arc::new(PillController::new(recorder)),
            http,
            storage: Arc::new(storage),
            settings: SettingsRuntime {
                start_hidden: launched_at_login && settings.start_in_background,
                current: Mutex::new(settings),
                cloud_token: Mutex::new(None),
                shortcut_capture: AtomicBool::new(false),
            },
            recording: RecordingRuntime::default(),
            downloads: TokenRegistry::default(),
            local_llm_verifying: AtomicBool::new(false),
            library: LibraryRuntime::default(),
            background: BackgroundRuntime::default(),
            meeting_capture: library::MeetingCaptureManager::default(),
            meeting_awareness: meeting_awareness::MeetingAwarenessManager::default(),
            local_transcriber: transcriber,
            local_llm_runtime: Arc::new(local_llm::LocalLlmRuntime::new()),
            settings_store,
            hotkeys: core::hotkeys::HotkeyCoordinator::default(),
            tray: Mutex::new(None),
            settings_close_handler_registered: AtomicBool::new(false),
        }
    }

    pub fn should_open_settings_on_startup(&self) -> bool {
        !self.settings.start_hidden
    }

    pub fn start_streaming_session(
        &self,
        app: &AppHandle<AppRuntime>,
        model: &model_manager::ReadyModel,
    ) {
        self.cancel_streaming_session();
        self.recording
            .stream
            .lock()
            .replace(streaming_transcription::StreamingSession::start(app, model));
    }

    pub fn start_cloud_streaming_session(&self, app: &AppHandle<AppRuntime>, language: String) {
        self.cancel_streaming_session();
        self.recording.stream.lock().replace(
            streaming_transcription::StreamingSession::start_cloud(app, language),
        );
    }

    pub fn stop_streaming_session(
        &self,
        app: &AppHandle<AppRuntime>,
    ) -> Option<streaming_transcription::StreamingOutcome> {
        self.recording
            .stream
            .lock()
            .take()
            .map(|stream| stream.stop(app))
    }

    pub fn cancel_streaming_session(&self) {
        self.recording.stream.lock().take();
    }

    pub fn has_streaming_session(&self) -> bool {
        self.recording.stream.lock().is_some()
    }

    pub fn analytics_state(&self) -> (bool, String) {
        let settings = self.settings.current.lock();
        (
            settings.analytics_enabled,
            settings.analytics_install_id.clone(),
        )
    }

    pub fn analytics_first_run(&self) -> bool {
        self.settings.current.lock().analytics_first_run
    }

    pub fn is_auto_update_enabled(&self) -> bool {
        self.settings.current.lock().auto_update_enabled
    }

    pub fn is_backend_idle(&self) -> bool {
        self.downloads.is_empty()
            && self.library.active_id.lock().is_none()
            && self.library.pending.lock().is_empty()
            && self.background.retry_tokens.is_empty()
    }

    pub fn set_auto_update_completed(&self) {
        self.background
            .auto_update_completed
            .store(true, Ordering::SeqCst);
    }

    pub fn take_auto_update_completed(&self) -> bool {
        self.background
            .auto_update_completed
            .swap(false, Ordering::SeqCst)
    }

    pub fn current_settings(&self) -> UserSettings {
        let snapshot = self.settings.current.lock().clone();
        self.settings_for_response(snapshot)
    }

    pub(crate) fn current_settings_unmasked(&self) -> UserSettings {
        self.settings.current.lock().clone()
    }

    pub(crate) fn settings_for_response(&self, mut value: UserSettings) -> UserSettings {
        if !license::license_gate_active(&self.settings_store) {
            suppress_gated_preferences(&mut value);
        }
        value
    }

    pub(crate) fn emit_settings_changed(
        &self,
        app: &AppHandle<AppRuntime>,
        settings: &UserSettings,
    ) {
        let payload = self.settings_for_response(settings.clone());
        if let Err(error) = app.emit(EVENT_SETTINGS_CHANGED, payload) {
            tracing::error!("Failed to emit settings change: {error}");
        }
    }

    pub fn persist_settings(&self, candidate: UserSettings) -> LooperResult<UserSettings> {
        let mut current = self.settings.current.lock();
        let saved = save_canonical_settings(&self.settings_store, candidate)?;
        current.clone_from(&saved);
        Ok(saved)
    }

    pub(crate) fn persist_settings_with(
        &self,
        change: impl FnOnce(&UserSettings, &mut UserSettings),
    ) -> LooperResult<(UserSettings, UserSettings)> {
        let mut current = self.settings.current.lock();
        let previous = current.clone();
        let mut proposed = previous.clone();
        change(&previous, &mut proposed);
        let saved = save_canonical_settings(&self.settings_store, proposed)?;
        current.clone_from(&saved);
        Ok((previous, saved))
    }

    pub fn pill(&self) -> &PillController {
        self.pill.as_ref()
    }

    pub fn set_shortcut_capture_active(&self, active: bool) {
        self.settings
            .shortcut_capture
            .store(active, Ordering::SeqCst);
    }

    pub fn is_shortcut_capture_active(&self) -> bool {
        self.settings.shortcut_capture.load(Ordering::SeqCst)
    }

    pub fn record_transcription_completed(&self) {
        *self.background.transcription_count.lock() += 1;
    }

    pub(crate) fn session_metrics(&self) -> (f64, u32) {
        (
            self.background.session_started_at.elapsed().as_secs_f64(),
            *self.background.transcription_count.lock(),
        )
    }

    pub(crate) fn http(&self) -> Client {
        self.http.clone()
    }

    pub(crate) fn cloud_auth_token(&self) -> Option<String> {
        self.settings.cloud_token.lock().clone()
    }

    pub(crate) fn set_cloud_auth_token(&self, token: Option<String>) {
        *self.settings.cloud_token.lock() = token.filter(|value| !value.trim().is_empty());
    }

    pub(crate) fn local_transcriber(&self) -> Arc<local_transcription::LocalTranscriber> {
        Arc::clone(&self.local_transcriber)
    }

    pub(crate) fn storage(&self) -> Arc<storage::StorageManager> {
        Arc::clone(&self.storage)
    }

    pub(crate) fn meeting_capture(&self) -> &library::MeetingCaptureManager {
        &self.meeting_capture
    }

    pub(crate) fn meeting_awareness(&self) -> &meeting_awareness::MeetingAwarenessManager {
        &self.meeting_awareness
    }

    pub fn store_tray(&self, tray: tauri::tray::TrayIcon<AppRuntime>) {
        self.tray.lock().replace(tray);
    }

    pub fn request_cancellation(&self) {
        self.recording.cancelled.store(true, Ordering::SeqCst);
        if let Some(token) = self.recording.cancellation.lock().as_ref() {
            token.cancel();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.recording.cancelled.load(Ordering::SeqCst)
    }

    pub fn clear_cancellation(&self) {
        self.recording.cancelled.store(false, Ordering::SeqCst);
        self.recording.cancellation.lock().take();
    }

    pub fn create_transcription_token(&self) -> CancellationToken {
        let fresh = CancellationToken::new();
        self.recording.cancellation.lock().replace(fresh.clone());
        fresh
    }

    pub fn should_show_ffmpeg_toast(&self) -> bool {
        self.recording
            .ffmpeg_notice_sent
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    pub fn set_pending_path(&self, path: Option<PathBuf>) {
        *self.recording.pending_path.lock() = path;
    }

    pub fn take_pending_path(&self) -> Option<PathBuf> {
        self.recording.pending_path.lock().take()
    }

    pub fn set_pending_selected_text(&self, text: Option<String>) {
        *self.recording.selected_text.lock() = text;
    }

    pub fn take_pending_selected_text(&self) -> Option<String> {
        self.recording.selected_text.lock().take()
    }

    pub fn set_pending_screen_terms_task(
        &self,
        task: Option<async_runtime::JoinHandle<Vec<String>>>,
    ) {
        *self.recording.screen_terms.lock() = task;
    }

    pub fn take_pending_screen_terms_task(&self) -> Option<async_runtime::JoinHandle<Vec<String>>> {
        self.recording.screen_terms.lock().take()
    }

    pub(crate) fn begin_pending_insertion(
        &self,
    ) -> oneshot::Receiver<transcribe::InsertionDecision> {
        self.recording.insertion.open()
    }

    pub(crate) fn resolve_pending_insertion(
        &self,
        decision: transcribe::InsertionDecision,
    ) -> bool {
        self.recording.insertion.resolve(decision)
    }

    pub(crate) fn clear_pending_insertion(&self) {
        self.recording.insertion.clear();
    }

    pub(crate) fn begin_pending_edit_action(
        &self,
    ) -> oneshot::Receiver<transcribe::EditActionDecision> {
        self.recording.edit_action.open()
    }

    pub(crate) fn resolve_pending_edit_action(
        &self,
        decision: transcribe::EditActionDecision,
    ) -> bool {
        self.recording.edit_action.resolve(decision)
    }

    pub(crate) fn clear_pending_edit_action(&self) {
        self.recording.edit_action.clear();
    }

    pub(crate) fn set_pending_voice_preset(
        &self,
        preset: Option<selection_actions::TransformPreset>,
    ) {
        *self.recording.voice_preset.lock() = preset;
    }

    pub(crate) fn pending_voice_preset(&self) -> Option<selection_actions::TransformPreset> {
        *self.recording.voice_preset.lock()
    }

    pub(crate) fn set_last_insertion(&self, undo: assistive::UndoState) {
        self.recording.last_insertion.lock().replace(undo);
    }

    pub(crate) fn take_last_insertion(&self) -> Option<assistive::UndoState> {
        self.recording.last_insertion.lock().take()
    }

    pub fn create_download_token(&self, model: &str) -> CancellationToken {
        self.downloads.replace(model.to_owned())
    }

    pub fn cancel_download(&self, model: &str) -> bool {
        self.downloads.cancel_and_remove(model)
    }

    pub fn has_download_token(&self, model: &str) -> bool {
        self.downloads.contains(model)
    }

    pub fn set_local_llm_verifying(&self, verifying: bool) {
        self.local_llm_verifying.store(verifying, Ordering::SeqCst);
    }

    pub fn local_llm_verifying(&self) -> bool {
        self.local_llm_verifying.load(Ordering::SeqCst)
    }

    pub fn clear_download_token(&self, model: &str) {
        self.downloads.remove(model);
    }

    pub fn register_library_transcription(&self, id: String) -> CancellationToken {
        self.library.tokens.find_or_create(id)
    }

    pub fn enqueue_library_job(&self, job: LibraryJob) -> bool {
        if self.library.tokens.contains(&job.id)
            || self.library.active_id.lock().as_deref() == Some(job.id.as_str())
        {
            return false;
        }
        let mut jobs = self.library.pending.lock();
        if jobs.iter().any(|queued| queued.id == job.id) {
            return false;
        }
        jobs.push_back(job);
        true
    }

    pub fn claim_next_library_job(&self) -> Option<LibraryJob> {
        let mut active = self.library.active_id.lock();
        if active.is_some() {
            return None;
        }
        let job = self.library.pending.lock().pop_front()?;
        active.replace(job.id.clone());
        Some(job)
    }

    pub fn clear_active_library_job(&self, id: &str) {
        let mut active = self.library.active_id.lock();
        if active.as_deref() == Some(id) {
            active.take();
        }
    }

    pub fn remove_library_job(&self, id: &str) -> bool {
        let mut jobs = self.library.pending.lock();
        let previous_len = jobs.len();
        jobs.retain(|job| job.id != id);
        previous_len != jobs.len()
    }

    pub fn cancel_library_transcription(&self, id: &str) {
        self.library.tokens.cancel(id);
    }

    pub fn clear_library_transcription(&self, id: &str) {
        self.library.tokens.remove(id);
    }

    pub fn register_retry_transcription(&self, id: String) -> CancellationToken {
        self.background.retry_tokens.replace(id)
    }

    pub fn cancel_retry_transcription(&self, id: &str) -> bool {
        self.background.retry_tokens.cancel_and_remove(id)
    }

    pub fn clear_retry_transcription(&self, id: &str) {
        self.background.retry_tokens.remove(id);
    }

    pub fn start_preflight_loop(&self, app: AppHandle<AppRuntime>) {
        if self
            .background
            .preflight_started
            .swap(true, Ordering::SeqCst)
        {
            return;
        }
        let cancellation = self.background.preflight_cancel.clone();
        let wake = Arc::clone(&self.background.preflight_notify);
        async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(llm_cleanup::PREFLIGHT_TTL);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            let mut forced = false;
            loop {
                tokio::select! {
                    _ = cancellation.cancelled() => break,
                    _ = wake.notified() => forced = true,
                    _ = ticker.tick() => {}
                }
                if cancellation.is_cancelled() {
                    break;
                }
                if !forced && llm_cleanup::cached_preflight_available().is_some() {
                    continue;
                }
                let state = app.state::<AppState>();
                llm_cleanup::run_preflight(state.http(), state.current_settings()).await;
                forced = false;
            }
        });
    }

    pub fn stop_preflight_loop(&self) {
        self.background.preflight_cancel.cancel();
    }

    pub fn request_preflight_refresh(&self) {
        llm_cleanup::clear_preflight_cache();
        self.background.preflight_notify.notify_one();
    }

    pub fn update_state(&self) -> &update_checker::SharedUpdateState {
        &self.background.update_state
    }
}

fn save_canonical_settings(
    store: &SettingsStore,
    mut settings: UserSettings,
) -> LooperResult<UserSettings> {
    crate::settings::sync_legacy_shortcuts_from_bindings(&mut settings);
    settings.auto_delete_duration =
        crate::settings::canonicalize_recording_prune_policy(settings.auto_delete_duration);
    store.save(&settings)?;
    Ok(settings)
}

fn suppress_gated_preferences(settings: &mut UserSettings) {
    settings.llm_enabled = false;
    settings.cleanup_enabled = false;
    settings.edit_mode_enabled = false;
    let groups = [
        &mut settings.shortcut_bindings.smart,
        &mut settings.shortcut_bindings.hold,
        &mut settings.shortcut_bindings.toggle,
    ];
    groups
        .into_iter()
        .flat_map(|bindings| bindings.iter_mut())
        .for_each(|binding| binding.cleanup_enabled = false);
}

#[cfg(test)]
mod tests {
    use super::{DecisionGate, TokenRegistry};

    #[test]
    fn decision_gate_is_single_use_and_reopenable() {
        let gate = DecisionGate::default();
        let first = gate.open();
        assert!(gate.resolve("accepted"));
        assert!(!gate.resolve("late"));
        assert_eq!(first.blocking_recv().unwrap(), "accepted");

        let abandoned = gate.open();
        gate.clear();
        assert!(abandoned.blocking_recv().is_err());
    }

    #[test]
    fn token_registry_distinguishes_reuse_from_replacement() {
        let registry = TokenRegistry::default();
        let shared = registry.find_or_create("model".to_string());
        let shared_again = registry.find_or_create("model".to_string());
        registry.cancel("model");
        assert!(shared.is_cancelled());
        assert!(shared_again.is_cancelled());

        let replacement = registry.replace("model".to_string());
        assert!(!replacement.is_cancelled());
        assert!(registry.cancel_and_remove("model"));
        assert!(replacement.is_cancelled());
        assert!(!registry.contains("model"));
    }
}
