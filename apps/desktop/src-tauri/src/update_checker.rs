//! Update discovery and installation policy for the desktop application.
//!
//! Tauri owns artifact verification and installation. This module coordinates
//! availability state, user-visible progress, and safe automatic restart timing.

use std::{path::PathBuf, sync::Arc, time::Duration};

use parking_lot::Mutex;
use reqwest::Url;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
use tracing::{debug, error, info, warn};

use crate::{pill::PillStatus, toast, AppRuntime, AppState};

const COMPILED_UPDATE_ENDPOINT: Option<&str> = option_env!("LOOPER_UPDATE_ENDPOINT");
const RESTART_MARKER_NAME: &str = ".auto_updated";
const DOWNLOAD_PROGRESS_EVENT: &str = "update:download-progress";

struct UpdateSchedule;

impl UpdateSchedule {
    const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
    const INITIAL_CHECK: Duration = Duration::from_secs(30);
    const AUTO_LOOP_START: Duration = Duration::from_secs(40);
    const REQUIRED_IDLE: Duration = Duration::from_secs(10 * 60);
    const ACTIVE_POLL: Duration = Duration::from_secs(30);
    const DORMANT_POLL: Duration = Duration::from_secs(5 * 60);
    const IDLE_SAMPLE: Duration = Duration::from_secs(10);
}

#[derive(Default)]
pub struct UpdateState {
    available_version: Option<String>,
    toast_shown_this_session: bool,
}

impl UpdateState {
    pub fn set_available(&mut self, version: String) {
        self.available_version = Some(version);
    }

    pub fn is_available(&self) -> bool {
        self.available_version.is_some()
    }

    pub fn available_version(&self) -> Option<&String> {
        self.available_version.as_ref()
    }

    pub fn mark_toast_shown(&mut self) {
        self.toast_shown_this_session = true;
    }

    pub fn should_show_toast(&self) -> bool {
        self.is_available() && !self.toast_shown_this_session
    }

    pub fn clear(&mut self) {
        self.available_version = None;
        self.toast_shown_this_session = false;
    }

    fn observe_version(&mut self, version: String) {
        if self.available_version.as_ref() != Some(&version) {
            self.set_available(version);
            self.toast_shown_this_session = false;
        }
    }

    fn status(&self, configured: bool) -> UpdateStatus {
        UpdateStatus {
            configured,
            available: self.is_available(),
            version: self.available_version().cloned(),
        }
    }
}

pub type SharedUpdateState = Arc<Mutex<UpdateState>>;

pub fn create_state() -> SharedUpdateState {
    Arc::new(Mutex::new(UpdateState::default()))
}

fn clear_availability(app: &AppHandle<AppRuntime>) {
    app.state::<AppState>().update_state().lock().clear();
    let _ = app.emit("update:cleared", ());
}

struct RestartMarker {
    path: PathBuf,
}

impl RestartMarker {
    fn for_app(app: &AppHandle<AppRuntime>) -> Option<Self> {
        app.path().app_data_dir().ok().map(|directory| Self {
            path: directory.join(RESTART_MARKER_NAME),
        })
    }

    fn write(&self) -> bool {
        if let Some(directory) = self.path.parent() {
            if let Err(failure) = std::fs::create_dir_all(directory) {
                warn!(
                    path = %directory.display(),
                    error = %failure,
                    "auto-update: failed to create marker directory"
                );
            }
        }
        match std::fs::write(&self.path, "auto_update_completed\n") {
            Ok(()) => true,
            Err(failure) => {
                error!(
                    path = %self.path.display(),
                    error = %failure,
                    "auto-update: failed to write restart marker"
                );
                false
            }
        }
    }

    fn consume(&self) -> MarkerConsumption {
        if !self.path.is_file() {
            return MarkerConsumption::Absent;
        }
        match std::fs::remove_file(&self.path) {
            Ok(()) => MarkerConsumption::Removed,
            Err(failure) => MarkerConsumption::Failed(failure),
        }
    }
}

enum MarkerConsumption {
    Absent,
    Removed,
    Failed(std::io::Error),
}

fn write_restart_marker(app: &AppHandle<AppRuntime>) -> bool {
    let Some(marker) = RestartMarker::for_app(app) else {
        warn!("auto-update: failed to resolve restart marker path");
        return false;
    };
    marker.write()
}

pub fn check_post_auto_update(app: &AppHandle<AppRuntime>) {
    let Some(marker) = RestartMarker::for_app(app) else {
        return;
    };
    match marker.consume() {
        MarkerConsumption::Absent => {}
        MarkerConsumption::Removed => {
            app.state::<AppState>().set_auto_update_completed();
            info!(
                "auto-update: detected post-restart marker, will show toast on next settings open"
            );
        }
        MarkerConsumption::Failed(failure) => {
            warn!(
                path = %marker.path.display(),
                error = %failure,
                "auto-update: failed to clear post-restart marker"
            );
        }
    }
}

pub fn start_background_checker(app: AppHandle<AppRuntime>, state: SharedUpdateState) {
    if !UpdateEndpoint::is_compiled() {
        info!("update checks disabled: LOOPER_UPDATE_ENDPOINT is not configured");
        return;
    }
    UpdateSupervisor::spawn(app, state);
}

struct UpdateSupervisor;

impl UpdateSupervisor {
    fn spawn(app: AppHandle<AppRuntime>, state: SharedUpdateState) {
        let automatic_app = app.clone();
        let automatic_state = Arc::clone(&state);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(UpdateSchedule::INITIAL_CHECK).await;
            loop {
                if let Err(failure) = check_for_update(&app, &state).await {
                    warn!(error = ?failure, "background update check failed");
                }
                tokio::time::sleep(UpdateSchedule::CHECK_INTERVAL).await;
            }
        });
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(UpdateSchedule::AUTO_LOOP_START).await;
            AutomaticUpdater::new(automatic_app, automatic_state)
                .run()
                .await;
        });
    }
}

struct AutomaticUpdater {
    app: AppHandle<AppRuntime>,
    updates: SharedUpdateState,
}

impl AutomaticUpdater {
    fn new(app: AppHandle<AppRuntime>, updates: SharedUpdateState) -> Self {
        Self { app, updates }
    }

    async fn run(self) {
        loop {
            if !self.auto_update_enabled() || !self.updates.lock().is_available() {
                tokio::time::sleep(UpdateSchedule::DORMANT_POLL).await;
                continue;
            }
            tokio::time::sleep(UpdateSchedule::ACTIVE_POLL).await;
            if settings_window_visible(&self.app)
                || !wait_for_idle(&self.app, UpdateSchedule::REQUIRED_IDLE).await
                || !restart_ready(&self.app, &self.updates)
            {
                continue;
            }

            info!("auto-update: app is idle and window hidden, downloading update");
            match UpdateResolver::new(&self.app).resolve().await {
                Ok(Some(update)) => {
                    let version = update.version.clone();
                    match update.download_and_install(|_, _| {}, || {}).await {
                        Ok(()) => {
                            if self.after_install(&version).await {
                                return;
                            }
                            continue;
                        }
                        Err(failure) => {
                            warn!(error = %failure, "auto-update: download/install failed");
                            crate::analytics::track_update_failed(
                                &self.app,
                                "automatic",
                                "download_install",
                                Some(&version),
                                crate::analytics::classify_failure_reason(&failure.to_string()),
                            );
                        }
                    }
                }
                Ok(None) => {}
                Err(failure) => {
                    warn!(error = %failure, "auto-update: failed to resolve update");
                    crate::analytics::track_update_failed(
                        &self.app,
                        "automatic",
                        "resolve",
                        None,
                        crate::analytics::classify_failure_reason(&failure),
                    );
                }
            }
            tokio::time::sleep(UpdateSchedule::CHECK_INTERVAL).await;
        }
    }

    fn auto_update_enabled(&self) -> bool {
        self.app.state::<AppState>().is_auto_update_enabled()
    }

    async fn after_install(&self, version: &str) -> bool {
        let mut marker_failure_reported = false;
        match self.restart_attempt(false) {
            RestartAttempt::Requested => return true,
            RestartAttempt::MarkerFailed => {
                warn!("auto-update: installed, but marker write failed");
                report_marker_failure(&self.app, version);
                marker_failure_reported = true;
            }
            RestartAttempt::NotReady => {
                info!("auto-update: installed, waiting for restart conditions");
            }
        }

        loop {
            tokio::time::sleep(UpdateSchedule::ACTIVE_POLL).await;
            if !self.auto_update_enabled() {
                return false;
            }
            match self.restart_attempt(true) {
                RestartAttempt::Requested => return true,
                RestartAttempt::NotReady => {}
                RestartAttempt::MarkerFailed => {
                    warn!("auto-update: installed, but deferred marker write failed");
                    if !marker_failure_reported {
                        report_marker_failure(&self.app, version);
                        marker_failure_reported = true;
                    }
                }
            }
        }
    }

    fn restart_attempt(&self, deferred: bool) -> RestartAttempt {
        if !restart_ready(&self.app, &self.updates) {
            return RestartAttempt::NotReady;
        }
        if !write_restart_marker(&self.app) {
            return RestartAttempt::MarkerFailed;
        }
        self.updates.lock().clear();
        if deferred {
            info!("auto-update: restarting (deferred)");
        } else {
            info!("auto-update: installed, restarting");
        }
        self.app.request_restart();
        RestartAttempt::Requested
    }
}

enum RestartAttempt {
    NotReady,
    MarkerFailed,
    Requested,
}

fn report_marker_failure(app: &AppHandle<AppRuntime>, version: &str) {
    crate::analytics::track_update_failed(
        app,
        "automatic",
        "restart_marker",
        Some(version),
        "storage",
    );
}

#[derive(Clone, Copy)]
struct RuntimeReadiness {
    auto_update_enabled: bool,
    pill_idle: bool,
    update_available: bool,
    settings_hidden: bool,
    backend_idle: bool,
}

impl RuntimeReadiness {
    fn permits_restart(self) -> bool {
        self.auto_update_enabled
            && self.pill_idle
            && self.update_available
            && self.settings_hidden
            && self.backend_idle
    }

    fn remains_idle(self) -> bool {
        self.auto_update_enabled && self.pill_idle && self.settings_hidden && self.backend_idle
    }
}

fn runtime_readiness(
    app: &AppHandle<AppRuntime>,
    updates: Option<&SharedUpdateState>,
) -> RuntimeReadiness {
    let app_state = app.state::<AppState>();
    RuntimeReadiness {
        auto_update_enabled: app_state.is_auto_update_enabled(),
        pill_idle: app_state.pill().status() == PillStatus::Idle,
        update_available: updates.is_some_and(|state| state.lock().is_available()),
        settings_hidden: !settings_window_visible(app),
        backend_idle: app_state.is_backend_idle(),
    }
}

async fn wait_for_idle(app: &AppHandle<AppRuntime>, required: Duration) -> bool {
    let mut elapsed = Duration::ZERO;
    while elapsed < required {
        tokio::time::sleep(UpdateSchedule::IDLE_SAMPLE).await;
        if !runtime_readiness(app, None).remains_idle() {
            return false;
        }
        elapsed += UpdateSchedule::IDLE_SAMPLE;
    }
    true
}

fn restart_ready(app: &AppHandle<AppRuntime>, updates: &SharedUpdateState) -> bool {
    runtime_readiness(app, Some(updates)).permits_restart()
}

fn settings_window_visible(app: &AppHandle<AppRuntime>) -> bool {
    app.get_webview_window(crate::SETTINGS_WINDOW_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

#[derive(Debug)]
struct UpdateEndpoint(Url);

impl UpdateEndpoint {
    fn is_compiled() -> bool {
        COMPILED_UPDATE_ENDPOINT.is_some()
    }

    fn compiled() -> Result<Self, String> {
        Self::parse(COMPILED_UPDATE_ENDPOINT)
    }

    fn parse(value: Option<&str>) -> Result<Self, String> {
        let raw =
            value.ok_or_else(|| "Update channel is not configured for this build.".to_owned())?;
        Url::parse(raw)
            .map(Self)
            .map_err(|failure| failure.to_string())
    }
}

struct UpdateResolver<'a> {
    app: &'a AppHandle<AppRuntime>,
}

impl<'a> UpdateResolver<'a> {
    fn new(app: &'a AppHandle<AppRuntime>) -> Self {
        Self { app }
    }

    async fn resolve(&self) -> Result<Option<tauri_plugin_updater::Update>, String> {
        let endpoint = UpdateEndpoint::compiled()?.0;
        let builder = self
            .app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|failure| failure.to_string())?;
        let updater = builder.build().map_err(|failure| failure.to_string())?;
        updater.check().await.map_err(|failure| failure.to_string())
    }
}

async fn check_for_update(
    app: &AppHandle<AppRuntime>,
    state: &SharedUpdateState,
) -> anyhow::Result<()> {
    debug!("checking for updates");
    match UpdateResolver::new(app)
        .resolve()
        .await
        .map_err(anyhow::Error::msg)?
    {
        Some(update) => {
            let version = update.version.clone();
            info!(version = %version, "update available");
            state.lock().observe_version(version.clone());
            let _ = app.emit("update:available", version);
        }
        None => {
            debug!("no updates available");
            clear_availability(app);
        }
    }
    Ok(())
}

pub fn maybe_show_update_toast(app: &AppHandle<AppRuntime>, state: &SharedUpdateState) {
    if app.state::<AppState>().is_auto_update_enabled() {
        return;
    }
    let (should_show, version) = {
        let update = state.lock();
        (
            update.should_show_toast(),
            update.available_version().cloned(),
        )
    };
    if !should_show {
        return;
    }
    state.lock().mark_toast_shown();
    toast::emit_toast(app, update_toast(version.as_deref()));
}

fn update_toast(version: Option<&str>) -> toast::Payload {
    let message = version
        .map(|available| format!("v{} → v{available}", env!("CARGO_PKG_VERSION")))
        .unwrap_or_else(|| "Update available.".to_owned());
    toast::Payload {
        toast_type: "update".to_owned(),
        title: None,
        message,
        auto_dismiss: Some(false),
        duration: None,
        retry_id: None,
        mode: None,
        action: Some("open_about_page".to_owned()),
        action_label: Some("Update".to_owned()),
        secondary_action: None,
        secondary_action_label: None,
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct UpdateStatus {
    pub configured: bool,
    pub available: bool,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub progress: Option<u8>,
}

#[derive(Default)]
struct TransferMeter {
    downloaded: u64,
    total: Option<u64>,
}

impl TransferMeter {
    fn receive(
        &mut self,
        chunk_length: usize,
        content_length: Option<u64>,
    ) -> UpdateDownloadProgress {
        if self.total.is_none() {
            self.total = content_length;
        }
        self.downloaded = self.downloaded.saturating_add(chunk_length as u64);
        self.progress()
    }

    fn progress(&self) -> UpdateDownloadProgress {
        let progress = self.total.and_then(|total| {
            self.downloaded
                .saturating_mul(100)
                .checked_div(total)
                .map(|percent| percent.min(100) as u8)
        });
        UpdateDownloadProgress {
            downloaded: self.downloaded,
            total: self.total,
            progress,
        }
    }

    fn completed(&self) -> UpdateDownloadProgress {
        UpdateDownloadProgress {
            downloaded: self.downloaded,
            total: self.total,
            progress: Some(100),
        }
    }
}

#[tauri::command]
pub fn get_update_status(app: AppHandle<AppRuntime>) -> UpdateStatus {
    let state = app.state::<AppState>();
    let status = state
        .update_state()
        .lock()
        .status(UpdateEndpoint::is_compiled());
    status
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle<AppRuntime>) -> Result<UpdateStatus, String> {
    let updates = app.state::<AppState>().update_state().clone();
    check_for_update(&app, &updates)
        .await
        .map_err(|failure| failure.to_string())?;
    let status = updates.lock().status(true);
    Ok(status)
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle<AppRuntime>) -> Result<(), String> {
    let update = match UpdateResolver::new(&app).resolve().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            crate::analytics::track_update_failed(&app, "manual", "resolve", None, "not_found");
            return Err("No update is currently available.".to_owned());
        }
        Err(failure) => {
            crate::analytics::track_update_failed(
                &app,
                "manual",
                "resolve",
                None,
                crate::analytics::classify_failure_reason(&failure),
            );
            return Err(failure);
        }
    };
    let version = update.version.clone();
    let progress_app = app.clone();
    let mut meter = TransferMeter::default();
    if let Err(failure) = update
        .download_and_install(
            |chunk_length, content_length| {
                let progress = meter.receive(chunk_length, content_length);
                let _ = progress_app.emit(DOWNLOAD_PROGRESS_EVENT, progress);
            },
            || {},
        )
        .await
    {
        crate::analytics::track_update_failed(
            &app,
            "manual",
            "download_install",
            Some(&version),
            crate::analytics::classify_failure_reason(&failure.to_string()),
        );
        return Err(failure.to_string());
    }
    let _ = app.emit(DOWNLOAD_PROGRESS_EVENT, meter.completed());
    clear_availability(&app);
    info!("update downloaded and installed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_state_resets_toast_only_when_the_version_changes() {
        let mut state = UpdateState::default();
        state.observe_version("2.0.0".to_owned());
        assert!(state.should_show_toast());
        state.mark_toast_shown();
        state.observe_version("2.0.0".to_owned());
        assert!(!state.should_show_toast());
        state.observe_version("2.1.0".to_owned());
        assert!(state.should_show_toast());
        assert_eq!(state.available_version().map(String::as_str), Some("2.1.0"));
        state.clear();
        assert!(!state.is_available());
        assert!(!state.toast_shown_this_session);
    }

    #[test]
    fn update_status_preserves_configured_availability_and_version_wire() {
        let mut state = UpdateState::default();
        assert_eq!(
            state.status(false),
            UpdateStatus {
                configured: false,
                available: false,
                version: None,
            }
        );
        state.set_available("3.0.0".to_owned());
        assert_eq!(
            serde_json::to_value(state.status(true)).unwrap(),
            serde_json::json!({
                "configured": true,
                "available": true,
                "version": "3.0.0",
            })
        );
    }

    #[test]
    fn runtime_readiness_requires_every_restart_condition() {
        let ready = RuntimeReadiness {
            auto_update_enabled: true,
            pill_idle: true,
            update_available: true,
            settings_hidden: true,
            backend_idle: true,
        };
        assert!(ready.permits_restart());
        assert!(ready.remains_idle());
        assert!(!RuntimeReadiness {
            settings_hidden: false,
            ..ready
        }
        .permits_restart());
        assert!(!RuntimeReadiness {
            update_available: false,
            ..ready
        }
        .permits_restart());
        assert!(RuntimeReadiness {
            update_available: false,
            ..ready
        }
        .remains_idle());
    }

    #[test]
    fn schedule_keeps_staggering_idle_window_and_poll_intervals() {
        assert_eq!(UpdateSchedule::INITIAL_CHECK, Duration::from_secs(30));
        assert_eq!(UpdateSchedule::AUTO_LOOP_START, Duration::from_secs(40));
        assert_eq!(UpdateSchedule::CHECK_INTERVAL, Duration::from_secs(21_600));
        assert_eq!(UpdateSchedule::REQUIRED_IDLE, Duration::from_secs(600));
        assert_eq!(UpdateSchedule::ACTIVE_POLL, Duration::from_secs(30));
        assert_eq!(UpdateSchedule::DORMANT_POLL, Duration::from_secs(300));
        assert_eq!(UpdateSchedule::IDLE_SAMPLE, Duration::from_secs(10));
    }

    #[test]
    fn endpoint_policy_distinguishes_missing_invalid_and_valid_channels() {
        assert_eq!(
            UpdateEndpoint::parse(None).unwrap_err(),
            "Update channel is not configured for this build."
        );
        assert!(UpdateEndpoint::parse(Some("not a url")).is_err());
        assert_eq!(
            UpdateEndpoint::parse(Some("https://updates.example.test/latest.json"))
                .unwrap()
                .0
                .as_str(),
            "https://updates.example.test/latest.json"
        );
    }

    #[test]
    fn restart_marker_round_trips_and_absence_is_idempotent() {
        let directory = tempfile::tempdir().unwrap();
        let marker = RestartMarker {
            path: directory.path().join("nested").join(RESTART_MARKER_NAME),
        };
        assert!(matches!(marker.consume(), MarkerConsumption::Absent));
        assert!(marker.write());
        assert_eq!(
            std::fs::read_to_string(&marker.path).unwrap(),
            "auto_update_completed\n"
        );
        assert!(matches!(marker.consume(), MarkerConsumption::Removed));
        assert!(matches!(marker.consume(), MarkerConsumption::Absent));
    }

    #[test]
    fn transfer_meter_tracks_unknown_known_zero_and_saturated_progress() {
        let mut meter = TransferMeter::default();
        assert_eq!(
            meter.receive(20, None),
            UpdateDownloadProgress {
                downloaded: 20,
                total: None,
                progress: None,
            }
        );
        assert_eq!(meter.receive(30, Some(100)).progress, Some(50));
        assert_eq!(meter.receive(100, Some(999)).progress, Some(100));
        assert_eq!(meter.total, Some(100));

        let mut zero = TransferMeter::default();
        assert_eq!(zero.receive(1, Some(0)).progress, None);
        zero.downloaded = u64::MAX;
        assert_eq!(zero.receive(10, None).downloaded, u64::MAX);
        assert_eq!(zero.completed().progress, Some(100));
    }

    #[test]
    fn progress_and_toast_payloads_keep_frontend_contracts() {
        assert_eq!(
            serde_json::to_value(UpdateDownloadProgress {
                downloaded: 5,
                total: Some(10),
                progress: Some(50),
            })
            .unwrap(),
            serde_json::json!({
                "downloaded": 5,
                "total": 10,
                "progress": 50,
            })
        );
        let payload = update_toast(Some("9.9.9"));
        assert_eq!(
            payload.message,
            format!("v{} → v9.9.9", env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(payload.toast_type, "update");
        assert_eq!(payload.auto_dismiss, Some(false));
        assert_eq!(payload.action.as_deref(), Some("open_about_page"));
        assert_eq!(payload.action_label.as_deref(), Some("Update"));
        assert_eq!(update_toast(None).message, "Update available.");
    }
}
