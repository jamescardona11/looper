use crate::{AppRuntime, AppState, SETTINGS_WINDOW_LABEL};
use std::sync::atomic::Ordering;
#[cfg(target_os = "macos")]
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

#[cfg(target_os = "macos")]
const RESTORE_DELAY_MS: u64 = 120;

struct SettingsWindowResolution {
    window: WebviewWindow<AppRuntime>,
    created: bool,
}

fn resolve_settings_window(app: &AppHandle<AppRuntime>) -> tauri::Result<SettingsWindowResolution> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        return Ok(SettingsWindowResolution {
            window,
            created: false,
        });
    }

    let builder = WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, WebviewUrl::default())
        .title("Looper")
        .inner_size(900.0, 750.0)
        .min_inner_size(900.0, 750.0)
        .resizable(true)
        .background_color(tauri::window::Color(25, 26, 32, 255))
        .visible(false);
    #[cfg(target_os = "macos")]
    let builder = builder.hidden_title(true);
    #[cfg(target_os = "windows")]
    let builder = builder.decorations(false);

    Ok(SettingsWindowResolution {
        window: builder.build()?,
        created: true,
    })
}

fn reveal(window: &WebviewWindow<AppRuntime>) -> tauri::Result<()> {
    if window.is_minimized().unwrap_or(false) {
        window.unminimize()?;
    }
    window.show()?;
    window.set_focus()
}

fn settings_update_payload(version: &str) -> crate::toast::Payload {
    crate::toast::Payload {
        toast_type: "success".to_string(),
        title: None,
        message: format!("Looper updated to v{version}."),
        auto_dismiss: Some(true),
        duration: Some(5000),
        retry_id: None,
        mode: None,
        action: None,
        action_label: None,
        secondary_action: None,
        secondary_action_label: None,
    }
}

fn resets_close_handler(created: bool) -> bool {
    created
}

fn needs_close_handler_registration(already_registered: bool) -> bool {
    !already_registered
}

fn emit_update_completion(app: &AppHandle<AppRuntime>, state: &AppState) {
    if !state.take_auto_update_completed() {
        return;
    }
    crate::toast::emit_toast(app, settings_update_payload(env!("CARGO_PKG_VERSION")));
}

fn register_close_handler(
    app: &AppHandle<AppRuntime>,
    state: &AppState,
    window: &WebviewWindow<AppRuntime>,
) {
    if !needs_close_handler_registration(
        state
            .settings_close_handler_registered
            .swap(true, Ordering::SeqCst),
    ) {
        return;
    }

    let app_handle = app.clone();
    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_handle.hide();
            if let Err(error) = crate::restore_recording_shortcuts(&app_handle) {
                tracing::error!(
                    "Failed to restore recording shortcuts after closing Settings: {error}"
                );
            }
            #[cfg(target_os = "macos")]
            restore_background_surfaces(app_handle.clone());
        }
    });
}

#[cfg(target_os = "macos")]
fn restore_background_surfaces(app: AppHandle<AppRuntime>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(RESTORE_DELAY_MS));
        if let Err(error) = crate::pill::show_idle_sticky(&app) {
            tracing::error!("Failed to restore Dictation after closing Looper: {error}");
        }
        app.state::<AppState>()
            .meeting_awareness()
            .request_refresh();
    });
}

pub fn toggle_settings_window(app: &AppHandle<AppRuntime>) -> tauri::Result<()> {
    let state = app.state::<AppState>();
    let resolved = resolve_settings_window(app)?;
    if resets_close_handler(resolved.created) {
        state
            .settings_close_handler_registered
            .store(false, Ordering::SeqCst);
    }

    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(ActivationPolicy::Regular);

    reveal(&resolved.window)?;
    emit_update_completion(app, &state);
    register_close_handler(app, &state, &resolved.window);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_completion_payload_is_a_timed_success_toast() {
        let payload = settings_update_payload("1.2.3");

        assert_eq!(payload.toast_type, "success");
        assert_eq!(payload.message, "Looper updated to v1.2.3.");
        assert_eq!(payload.duration, Some(5000));
        assert_eq!(payload.auto_dismiss, Some(true));
        assert!(payload.retry_id.is_none());
    }

    #[test]
    fn window_lifecycle_policies_only_reset_or_register_when_needed() {
        assert!(resets_close_handler(true));
        assert!(!resets_close_handler(false));
        assert!(needs_close_handler_registration(false));
        assert!(!needs_close_handler_registration(true));
    }

    #[test]
    fn update_completion_payload_does_not_offer_a_second_action() {
        let payload = settings_update_payload("1.2.3");

        assert!(payload.title.is_none());
        assert!(payload.mode.is_none());
        assert!(payload.action.is_none());
        assert!(payload.action_label.is_none());
        assert!(payload.secondary_action.is_none());
        assert!(payload.secondary_action_label.is_none());
    }
}
