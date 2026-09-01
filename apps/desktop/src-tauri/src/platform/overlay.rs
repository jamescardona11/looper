use crate::AppRuntime;
use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(not(target_os = "macos"))]
use tauri::{LogicalSize, PhysicalPosition};

const PROTECTED_WINDOW_LABELS: [&str; 3] = [
    crate::MAIN_WINDOW_LABEL,
    crate::toast::WINDOW_LABEL,
    crate::awareness_notification::WINDOW_LABEL,
];

pub fn init(app: &AppHandle<AppRuntime>, overlay_window: &WebviewWindow<AppRuntime>) {
    #[cfg(target_os = "windows")]
    let _ = app;

    #[cfg(target_os = "macos")]
    if let Err(err) = crate::platform::macos::overlay::init(app, overlay_window) {
        tracing::error!("Failed to initialize macOS overlay panel: {err}");
    }

    #[cfg(target_os = "windows")]
    if let Err(err) = crate::platform::windows::overlay::init(overlay_window) {
        tracing::error!("Failed to initialize Windows overlay surface: {err}");
    }

    let protected = app
        .state::<crate::AppState>()
        .current_settings_unmasked()
        .hide_overlays_from_capture;
    sync_content_protection(app, protected);
}

/// Best-effort content protection. Tauri maps this to NSWindow sharing on
/// macOS and SetWindowDisplayAffinity on Windows; some capture tools or OS
/// versions can still ignore the hint.
pub fn sync_content_protection(app: &AppHandle<AppRuntime>, protected: bool) {
    for label in PROTECTED_WINDOW_LABELS {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if let Err(err) = window.set_content_protected(protected) {
            tracing::warn!("Failed to set best-effort capture protection for {label}: {err}");
        }
    }
}

pub fn show(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    interactive: bool,
) {
    #[cfg(target_os = "windows")]
    let _ = app;

    #[cfg(target_os = "macos")]
    if let Err(err) = crate::platform::macos::overlay::show(app, overlay_window, interactive) {
        tracing::error!("Failed to show macOS overlay panel: {err}");
    }

    #[cfg(target_os = "windows")]
    if let Err(err) = crate::platform::windows::overlay::show(overlay_window, interactive) {
        tracing::error!("Failed to show Windows overlay surface: {err}");
    }
}

pub fn set_interactive(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    interactive: bool,
) {
    #[cfg(target_os = "macos")]
    let _ = overlay_window;

    #[cfg(target_os = "windows")]
    let _ = app;

    #[cfg(target_os = "macos")]
    if let Err(err) = crate::platform::macos::overlay::set_interactive(app, interactive) {
        tracing::error!("Failed to update macOS overlay interactivity: {err}");
    }

    #[cfg(target_os = "windows")]
    if let Err(err) =
        crate::platform::windows::overlay::set_interactive(overlay_window, interactive)
    {
        tracing::error!("Failed to update Windows overlay interactivity: {err}");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = (app, overlay_window, interactive);
}

pub async fn set_frame(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
    physical_origin: (i32, i32),
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return crate::platform::macos::overlay::set_frame(
            app,
            overlay_window,
            logical_size,
            physical_origin,
        )
        .await
        .map_err(|error| format!("Failed to update macOS overlay frame: {error}"));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        overlay_window
            .set_size(LogicalSize::new(logical_size.0, logical_size.1))
            .map_err(|error| format!("Failed to resize overlay: {error}"))?;
        overlay_window
            .set_position(PhysicalPosition::new(
                physical_origin.0,
                physical_origin.1,
            ))
            .map_err(|error| format!("Failed to position overlay: {error}"))?;
        Ok(())
    }
}

pub fn schedule_frame(
    app: &AppHandle<AppRuntime>,
    overlay_window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
    physical_origin: (i32, i32),
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return crate::platform::macos::overlay::schedule_frame(
            app,
            overlay_window,
            logical_size,
            physical_origin,
        )
        .map_err(|error| format!("Failed to schedule macOS overlay frame: {error}"));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        overlay_window
            .set_size(LogicalSize::new(logical_size.0, logical_size.1))
            .map_err(|error| format!("Failed to resize overlay: {error}"))?;
        overlay_window
            .set_position(PhysicalPosition::new(physical_origin.0, physical_origin.1))
            .map_err(|error| format!("Failed to position overlay: {error}"))?;
        Ok(())
    }
}
