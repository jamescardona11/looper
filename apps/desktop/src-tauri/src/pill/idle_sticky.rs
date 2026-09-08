use super::{
    capture, clamp_overlay_position, physical_overlay_size, position_overlay_on_cursor_screen,
    preferred_capture_monitor, AppHandle, AppRuntime, AppState, CapturePillDockPosition,
    CapturePillPresentation, LogicalSize, Manager, PillStatus, MAIN_WINDOW_LABEL,
};

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

    super::platform::overlay::schedule_frame(app, &window, desired.logical_size, origin, scale)?;

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
    let task_app = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_on_main_thread(&task_app) {
            tracing::error!("Failed to restore Capture pill: {error}");
        }
    })
    .map_err(|error| error.to_string())
}

fn show_on_main_thread(app: &AppHandle<AppRuntime>) -> Result<(), String> {
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
    if !window.is_visible().unwrap_or(false) {
        super::platform::overlay::show(app, &window, true);
    }

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
            (frame.origin, monitor_scale)
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
                    .map(|origin| (origin, scale))
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
                Some((
                    capture::sticky_window_frame(
                        base_origin,
                        monitor_scale,
                        settings.capture_pill_presentation,
                        settings.capture_pill_dock_position,
                        hovering,
                        language_menu_open,
                    )
                    .origin,
                    monitor_scale,
                ))
            }),
    };

    if let Some((origin, target_scale)) = target_origin {
        super::platform::overlay::schedule_frame(app, &window, logical_size, origin, target_scale)?;
        pill.set_overlay_position(capture::canonical_sticky_origin(
            origin,
            target_scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
            hovering,
            language_menu_open,
        ));
    } else {
        window
            .set_size(LogicalSize::new(logical_size.0, logical_size.1))
            .map_err(|error| format!("Failed to resize Dictation sticky: {error}"))?;
        position_overlay_on_cursor_screen(&window, logical_size);
    }

    state.pill().start_hover_emitter(app);
    Ok(())
}

/// Manual recovery works without the keyboard listener and preserves the
/// configured dock edge. Floating launchers return to the cursor's display.
pub fn recover(app: &AppHandle<AppRuntime>) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.pill().status() != PillStatus::Idle || state.meeting_capture().is_active() {
        super::show_overlay(app);
        return Ok(());
    }
    *state.pill().overlay_position.lock() = None;
    show(app)
}
