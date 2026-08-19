use tauri::{AppHandle, Manager};

use crate::{meeting_awareness::MeetingAwarenessPhase, pill::PillStatus, AppRuntime, AppState};

pub const WINDOW_LABEL: &str = "meeting-awareness";
const SHADOW_GUTTER: f64 = 8.0;
const SURFACE_WIDTH: f64 = 404.0;
const SURFACE_HEIGHT: f64 = 112.0;
const WIDTH: f64 = SURFACE_WIDTH + SHADOW_GUTTER * 2.0;
const HEIGHT: f64 = SURFACE_HEIGHT + SHADOW_GUTTER * 2.0;

pub fn show(app: &AppHandle<AppRuntime>) {
    if !awareness_is_current(app) {
        return;
    }
    let toast_visible = toast_is_visible(app);
    let toast_preemptible = crate::toast::meeting_awareness_may_preempt();
    if toast_blocks_awareness(toast_visible, toast_preemptible) {
        return;
    }
    if toast_visible {
        // Este aviso puede reemplazar el toast de permisos. Ocultar el toast
        // normalmente restaura awareness de forma diferida, pero aquí la
        // presentación debe ser explícita para no perder la primera alerta.
        crate::toast::hide_surface(app);
        show_window(app);
        return;
    }
    show_window(app);
}

pub fn restore_after_toast(app: &AppHandle<AppRuntime>) {
    if awareness_is_current(app) {
        show_window(app);
    }
}

fn show_window(app: &AppHandle<AppRuntime>) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        tracing::error!("Meeting notification window not found");
        return;
    };

    if let Err(error) = window.set_size(tauri::LogicalSize::new(WIDTH, HEIGHT)) {
        tracing::error!("Failed to resize meeting notification: {error}");
    }
    crate::toast::position_notification_window(app, &window, (WIDTH, HEIGHT));

    // Position and reveal must be queued in this order. If the panel is
    // revealed first, macOS briefly paints its old frame before the final
    // position lands, which makes the notification visibly jump.
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window(WINDOW_LABEL) {
            crate::toast::position_notification_window(&handle, &window, (WIDTH, HEIGHT));
        }
    });
    crate::platform::toast::set_interactive(app, &window, true);
    crate::platform::toast::show(app, &window);
}

fn toast_is_visible(app: &AppHandle<AppRuntime>) -> bool {
    app.get_webview_window(crate::toast::WINDOW_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn toast_blocks_awareness(visible: bool, preemptible: bool) -> bool {
    visible && !preemptible
}

fn awareness_is_current(app: &AppHandle<AppRuntime>) -> bool {
    let Some(state) = app.try_state::<AppState>() else {
        return false;
    };
    should_present_awareness(
        state.meeting_awareness().state().phase,
        state.meeting_capture().is_active(),
        state.pill().is_recording()
            || matches!(
                state.pill().status(),
                PillStatus::Listening | PillStatus::Processing
            ),
    )
}

fn should_present_awareness(
    phase: MeetingAwarenessPhase,
    meeting_active: bool,
    dictation_busy: bool,
) -> bool {
    phase != MeetingAwarenessPhase::Idle && !meeting_active && !dictation_busy
}

pub fn hide(app: &AppHandle<AppRuntime>) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        crate::platform::toast::hide(app, &window);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn awareness_only_returns_after_the_competing_activity_ends() {
        assert!(should_present_awareness(
            MeetingAwarenessPhase::Detected,
            false,
            false,
        ));
        assert!(!should_present_awareness(
            MeetingAwarenessPhase::Idle,
            false,
            false,
        ));
        assert!(!should_present_awareness(
            MeetingAwarenessPhase::Detected,
            true,
            false,
        ));
        assert!(!should_present_awareness(
            MeetingAwarenessPhase::Detected,
            false,
            true,
        ));
    }

    #[test]
    fn a_permission_toast_cannot_block_a_detected_meeting() {
        assert!(!toast_blocks_awareness(true, true));
        assert!(toast_blocks_awareness(true, false));
        assert!(!toast_blocks_awareness(false, false));
    }
}
