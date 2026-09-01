use super::{
    capture, clamp_overlay_position, physical_overlay_size, position_overlay_on_cursor_screen,
    preferred_capture_monitor, AppHandle, AppRuntime, AppState, CapturePillDockPosition,
    CapturePillPresentation, LogicalSize, Manager, PillStatus, MAIN_WINDOW_LABEL,
};
use tauri::PhysicalPosition;

/// Resizes the native idle window together with the React pill. Keeping a
/// permanent expanded NSPanel behind the compact launcher left a visible gray
/// WebView rectangle and captured an unnecessarily large desktop region.
pub(super) fn resize_for_hover(
    app: &AppHandle<AppRuntime>,
    next_hovering: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.pill().status() != PillStatus::Idle
        || state.meeting_capture().is_active()
        || *state.pill().preflight_language_menu_open.lock()
    {
        return Ok(());
    }

    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Dictation sticky window not found.".to_string())?;
    let scale = window
        .scale_factor()
        .map_err(|error| format!("Failed to read Dictation sticky scale: {error}"))?;
    let current = window
        .outer_position()
        .map_err(|error| format!("Failed to read Dictation sticky position: {error}"))?;
    let settings = state.current_settings_unmasked();
    let canonical = capture::canonical_sticky_origin(
        (current.x, current.y),
        scale,
        settings.capture_pill_presentation,
        settings.capture_pill_dock_position,
        state.pill().is_hovering(),
        false,
    );
    let desired = capture::sticky_window_frame(
        canonical,
        scale,
        settings.capture_pill_presentation,
        settings.capture_pill_dock_position,
        next_hovering,
        false,
    );
    let physical_size = physical_overlay_size(desired.logical_size, scale);
    let origin = clamp_overlay_position(&window, desired.origin.0, desired.origin.1, physical_size)
        .ok_or_else(|| "No display is available for the Capture pill.".to_string())?;

    window
        .set_size(LogicalSize::new(
            desired.logical_size.0,
            desired.logical_size.1,
        ))
        .map_err(|error| format!("Failed to resize Dictation sticky: {error}"))?;
    window
        .set_position(PhysicalPosition::new(origin.0, origin.1))
        .map_err(|error| format!("Failed to position Dictation sticky: {error}"))?;

    state
        .pill()
        .set_overlay_position(capture::canonical_sticky_origin(
            origin,
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
            next_hovering,
            false,
        ));
    Ok(())
}

pub fn show(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.pill().status() != PillStatus::Idle || state.meeting_capture().is_active() {
        return Ok(());
    }

    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Dictation sticky window not found.".to_string())?;
    let settings = state.current_settings_unmasked();
    let pill = state.pill();
    let language_menu_open = *pill.preflight_language_menu_open.lock();
    let hovering = pill.is_hovering();
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical_size = capture::sticky_window_size(hovering, language_menu_open);
    let physical_size = physical_overlay_size(logical_size, scale);

    // AppKit can restore the NSPanel's previous frame when it is shown. Make
    // the panel visible first, then apply the canonical dock/floating anchor.
    super::platform::overlay::show(app, &window, true);

    let target_origin = match settings.capture_pill_presentation {
        CapturePillPresentation::Dock => preferred_capture_monitor(&window).map(|monitor| {
            let work_area = monitor.work_area();
            let monitor_scale = monitor.scale_factor();
            let base_size = physical_overlay_size(
                (capture::WINDOW_WIDTH, capture::WINDOW_HEIGHT),
                monitor_scale,
            );
            let base_origin = capture::dock_origin(
                (work_area.position.x, work_area.position.y),
                (work_area.size.width, work_area.size.height),
                base_size,
                capture::logical_pixels(capture::EDGE_MARGIN, monitor_scale),
                settings.capture_pill_dock_position,
            );
            let frame = capture::sticky_window_frame(
                base_origin,
                monitor_scale,
                settings.capture_pill_presentation,
                settings.capture_pill_dock_position,
                hovering,
                language_menu_open,
            );
            tracing::debug!(
                presentation = ?settings.capture_pill_presentation,
                dock_position = ?settings.capture_pill_dock_position,
                work_x = work_area.position.x,
                work_y = work_area.position.y,
                work_width = work_area.size.width,
                work_height = work_area.size.height,
                window_x = frame.origin.0,
                window_y = frame.origin.1,
                window_width = frame.logical_size.0,
                window_height = frame.logical_size.1,
                "Positioning Capture pill"
            );
            frame.origin
        }),
        CapturePillPresentation::Floating => state
            .pill()
            .overlay_position()
            .and_then(|canonical| {
                let frame = capture::sticky_window_frame(
                    canonical,
                    scale,
                    settings.capture_pill_presentation,
                    settings.capture_pill_dock_position,
                    hovering,
                    language_menu_open,
                );
                clamp_overlay_position(&window, frame.origin.0, frame.origin.1, physical_size)
            })
            .or_else(|| {
                let monitor = preferred_capture_monitor(&window)?;
                let work_area = monitor.work_area();
                let monitor_scale = monitor.scale_factor();
                let base_size = physical_overlay_size(
                    (capture::WINDOW_WIDTH, capture::WINDOW_HEIGHT),
                    monitor_scale,
                );
                let base_origin = capture::dock_origin(
                    (work_area.position.x, work_area.position.y),
                    (work_area.size.width, work_area.size.height),
                    base_size,
                    capture::logical_pixels(85.0, monitor_scale),
                    CapturePillDockPosition::BottomCenter,
                );
                Some(
                    capture::sticky_window_frame(
                        base_origin,
                        monitor_scale,
                        settings.capture_pill_presentation,
                        settings.capture_pill_dock_position,
                        hovering,
                        language_menu_open,
                    )
                    .origin,
                )
            }),
    };

    if let Some(origin) = target_origin {
        let task_app = app.clone();
        let task_window = window.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) =
                super::platform::overlay::set_frame(&task_app, &task_window, logical_size, origin)
                    .await
            {
                tracing::error!("Failed to restore the Dictation sticky frame: {error}");
            }
        });
    } else {
        window
            .set_size(LogicalSize::new(logical_size.0, logical_size.1))
            .map_err(|error| format!("Failed to resize Dictation sticky: {error}"))?;
        position_overlay_on_cursor_screen(&window, logical_size);
    }

    state.pill().start_hover_emitter(app);
    Ok(())
}
