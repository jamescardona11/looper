mod payload;
#[cfg(target_os = "macos")]
mod permission_watch;
mod placement;

use crate::{pill, AppRuntime, AppState};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub use payload::Payload;

pub const WINDOW_LABEL: &str = "toast";
pub const EVENT_SHOW: &str = "toast:show";
pub const EVENT_HIDE: &str = "toast:hide";
pub const EVENT_RENDERER_READY: &str = "toast:renderer_ready";

static MEETING_AWARENESS_MAY_PREEMPT: AtomicBool = AtomicBool::new(false);

/// Notifications can be produced while the independent toast webview is
/// still booting. Keep them here until its event listeners are installed so a
/// transparent native panel is never revealed without rendered content.
#[derive(Default)]
struct PendingToasts {
    renderer_ready: bool,
    payloads: Vec<Payload>,
}

impl PendingToasts {
    fn queue_or_take(&mut self, payload: Payload) -> Option<Payload> {
        if self.renderer_ready {
            Some(payload)
        } else {
            self.payloads.push(payload);
            None
        }
    }

    fn mark_renderer_ready(&mut self) -> Vec<Payload> {
        self.renderer_ready = true;
        std::mem::take(&mut self.payloads)
    }

    fn clear(&mut self) {
        self.payloads.clear();
    }
}

fn pending_toasts() -> &'static Mutex<PendingToasts> {
    static PENDING: OnceLock<Mutex<PendingToasts>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(PendingToasts::default()))
}

pub fn emit_toast(app: &AppHandle<AppRuntime>, payload: Payload) {
    let payload = pending_toasts().lock().queue_or_take(payload);
    if let Some(payload) = payload {
        present_toast(app, payload);
    }
}

pub(crate) fn mark_renderer_ready(app: &AppHandle<AppRuntime>) {
    let payloads = pending_toasts().lock().mark_renderer_ready();
    for payload in payloads {
        present_toast(app, payload);
    }
}

fn present_toast(app: &AppHandle<AppRuntime>, payload: Payload) {
    MEETING_AWARENESS_MAY_PREEMPT.store(payload.is_permission_request(), Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    let permission_watch = permission_watch::Watch::begin(payload.action.as_deref());

    if should_dismiss_silence_warning(&payload) {
        if let Some(state) = app.try_state::<AppState>() {
            state.meeting_capture().dismiss_silence_warning();
        }
    }
    crate::awareness_notification::hide(app);
    reveal_surface(app);
    let _ = app.emit(EVENT_SHOW, payload);

    #[cfg(target_os = "macos")]
    if let Some(permission_watch) = permission_watch {
        permission_watch.monitor(app.clone());
    }
}

pub fn show(app: &AppHandle<AppRuntime>, toast_type: &str, title: Option<&str>, message: &str) {
    emit_toast(app, Payload::passive(toast_type, title, message));
}

pub fn show_with_action(
    app: &AppHandle<AppRuntime>,
    toast_type: &str,
    title: Option<&str>,
    message: &str,
    action: &str,
    action_label: &str,
) {
    emit_toast(
        app,
        Payload::actionable(toast_type, title, message, action, action_label),
    );
}

pub fn hide(app: &AppHandle<AppRuntime>) {
    pending_toasts().lock().clear();
    hide_surface(app);
    crate::awareness_notification::restore_after_toast(app);
}

pub(crate) fn hide_surface(app: &AppHandle<AppRuntime>) {
    MEETING_AWARENESS_MAY_PREEMPT.store(false, Ordering::SeqCst);
    #[cfg(target_os = "macos")]
    permission_watch::mark_toast_hidden();
    let _ = app.emit(EVENT_HIDE, ());
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        crate::platform::toast::hide(app, &window);
    }
}

pub(crate) fn meeting_awareness_may_preempt() -> bool {
    MEETING_AWARENESS_MAY_PREEMPT.load(Ordering::SeqCst)
}

fn should_dismiss_silence_warning(payload: &Payload) -> bool {
    payload.action.as_deref() != Some(crate::library::CONTINUE_MEETING_ACTION)
}

fn reveal_surface(app: &AppHandle<AppRuntime>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        placement::place_toast(app, &window);
        crate::platform::toast::show(app, &window);
    }
}

#[tauri::command]
pub fn set_toast_interactive(interactive: bool, app: AppHandle<AppRuntime>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        crate::platform::toast::set_interactive(&app, &window, interactive);
    }
}

pub(crate) fn position_notification_window(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
) {
    placement::place_notification(app, window, logical_size);
}

#[tauri::command]
pub fn toast_dismissed(app: AppHandle<AppRuntime>) {
    crate::auto_dictionary::clear_pending_suggestion();

    let state = app.state::<AppState>();
    state.meeting_capture().dismiss_silence_warning();
    if state.pill().status() == pill::PillStatus::Error {
        state.pill().reset(&app);
    }
    hide(&app);
}

#[tauri::command]
pub fn debug_show_toast(
    toast_type: String,
    message: String,
    action: Option<String>,
    action_label: Option<String>,
    app: AppHandle<AppRuntime>,
) {
    emit_toast(
        &app,
        Payload::diagnostic(toast_type, message, action, action_label),
    );
}

#[cfg(test)]
mod tests {
    use super::{
        should_dismiss_silence_warning, Payload, PendingToasts, EVENT_HIDE, EVENT_RENDERER_READY,
        EVENT_SHOW, WINDOW_LABEL,
    };

    #[test]
    fn only_permission_actions_allow_awareness_preemption() {
        let accessibility = Payload::actionable(
            "warning",
            None,
            "Allow accessibility",
            "open_accessibility_settings",
            "Open Settings",
        );
        let microphone = Payload::actionable(
            "warning",
            None,
            "Allow microphone",
            "open_microphone_settings",
            "Open Settings",
        );
        let retry = Payload::actionable("error", None, "Try again", "retry_transcription", "Retry");

        assert!(accessibility.is_permission_request());
        assert!(microphone.is_permission_request());
        assert!(!retry.is_permission_request());
        assert!(!Payload::passive("info", None, "Saved").is_permission_request());
    }

    #[test]
    fn event_names_and_meeting_continuation_policy_remain_stable() {
        assert_eq!(
            (WINDOW_LABEL, EVENT_SHOW, EVENT_HIDE, EVENT_RENDERER_READY),
            ("toast", "toast:show", "toast:hide", "toast:renderer_ready")
        );

        let continuation = Payload::actionable(
            "warning",
            None,
            "Meeting continues",
            crate::library::CONTINUE_MEETING_ACTION,
            "Continue",
        );
        let ordinary = Payload::passive("success", None, "Saved");

        assert!(!should_dismiss_silence_warning(&continuation));
        assert!(should_dismiss_silence_warning(&ordinary));
    }

    #[test]
    fn toast_waits_for_its_renderer_before_the_native_surface_is_revealed() {
        let mut pending = PendingToasts::default();
        let first = Payload::passive("info", None, "Starting up");
        let second = Payload::passive("warning", None, "Allow microphone access");

        assert!(pending.queue_or_take(first).is_none());
        assert!(pending.queue_or_take(second).is_none());

        let messages = pending
            .mark_renderer_ready()
            .into_iter()
            .map(|payload| payload.message)
            .collect::<Vec<_>>();
        assert_eq!(messages, ["Starting up", "Allow microphone access"]);
        assert!(pending
            .queue_or_take(Payload::passive("success", None, "Ready"))
            .is_some());
    }

    #[test]
    fn hiding_before_the_renderer_is_ready_discards_stale_toasts() {
        let mut pending = PendingToasts::default();
        let _ = pending.queue_or_take(Payload::passive("info", None, "Old message"));

        pending.clear();

        assert!(pending.mark_renderer_ready().is_empty());
    }
}
