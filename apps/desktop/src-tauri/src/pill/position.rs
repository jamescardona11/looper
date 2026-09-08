use super::{
    canonical_from_capture_dictation_origin, canonical_meeting_overlay_origin, capture,
    clamp_overlay_position, cursor_screen_overlay_position, dictation_origin_from_capture_anchor,
    meeting_overlay_geometry, meeting_overlay_logical_size, monitor_for_overlay_origin,
    physical_overlay_size, platform, points_share_closest_monitor, AppHandle, AppRuntime, AppState,
    Emitter, Manager, PillStatus, Serialize, DICTATION_OVERLAY_HEIGHT, DICTATION_OVERLAY_WIDTH,
    MAIN_WINDOW_LABEL, OVERLAY_OFFSCREEN_LIMIT,
};

#[derive(Clone, Serialize)]
pub struct OverlayPositionPayload {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub fn set_overlay_position(
    x: i32,
    y: i32,
    app: AppHandle<AppRuntime>,
) -> Result<OverlayPositionPayload, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Overlay window not found.".to_string())?;
    let app_state = app.state::<AppState>();
    let meeting_surface = app_state.meeting_capture().is_active();
    let idle_sticky = !meeting_surface && app_state.pill().status() == PillStatus::Idle;
    let scale = window
        .scale_factor()
        .map_err(|err| format!("Failed to read overlay scale: {err}"))?;
    let sticky_menu_open = idle_sticky && *app_state.pill().preflight_language_menu_open.lock();
    let sticky_expanded = idle_sticky && app_state.pill().is_hovering();
    let settings = app_state.current_settings_unmasked();
    let sticky_frame = idle_sticky.then(|| {
        capture::sticky_window_frame(
            (x, y),
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
            sticky_expanded,
            sticky_menu_open,
        )
    });
    let meeting_frame = if meeting_surface {
        let presentation = app_state.pill().meeting_overlay_presentation();
        let monitor = monitor_for_overlay_origin(&window, (x, y))
            .ok_or_else(|| "No display is available for the overlay.".to_string())?;
        Some(meeting_overlay_geometry(
            (x, y),
            scale,
            presentation.compact,
            presentation.transcript_visible,
            (monitor.position().x, monitor.position().y),
            (monitor.size().width, monitor.size().height),
        ))
    } else {
        None
    };
    // Lo que llega es la posición canónica: es la que este mismo comando
    // devolvió y la que el frontend guardó. Colocarla tal cual como origen de
    // ventana desplazaba la píldora en cada restauración.
    let requested = if let Some(frame) = meeting_frame {
        frame.origin
    } else if let Some(frame) = sticky_frame {
        frame.origin
    } else {
        dictation_origin_from_capture_anchor(
            (x, y),
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
        )
    };
    let logical_size = if let Some(frame) = meeting_frame {
        (
            f64::from(frame.logical_size.0),
            f64::from(frame.logical_size.1),
        )
    } else if let Some(frame) = sticky_frame {
        frame.logical_size
    } else {
        (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT)
    };
    let physical_size = physical_overlay_size(logical_size, scale);
    let restored_on_cursor_screen = window
        .cursor_position()
        .ok()
        .and_then(|cursor| {
            let monitors = window.available_monitors().ok()?;
            let bounds = monitors
                .iter()
                .map(|monitor| {
                    let position = monitor.position();
                    let size = monitor.size();
                    (position.x, position.y, size.width, size.height)
                })
                .collect::<Vec<_>>();
            let requested_center = (
                requested.0 + i32::try_from(physical_size.0 / 2).unwrap_or(i32::MAX),
                requested.1 + i32::try_from(physical_size.1 / 2).unwrap_or(i32::MAX),
            );
            Some(points_share_closest_monitor(
                requested_center,
                (cursor.x.round() as i32, cursor.y.round() as i32),
                &bounds,
            ))
        })
        .unwrap_or(true);
    let position = if idle_sticky && !restored_on_cursor_screen {
        cursor_screen_overlay_position(&window, logical_size)
            .or_else(|| clamp_overlay_position(&window, requested.0, requested.1, physical_size))
    } else {
        clamp_overlay_position(&window, requested.0, requested.1, physical_size)
    }
    .ok_or_else(|| "No display is available for the overlay.".to_string())?;
    platform::overlay::schedule_frame(&app, &window, logical_size, position, scale)?;
    let canonical_position = if meeting_surface {
        canonical_meeting_overlay_origin(
            position,
            scale,
            app_state.pill().meeting_overlay_presentation(),
        )
    } else if idle_sticky {
        capture::canonical_sticky_origin(
            position,
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
            sticky_expanded,
            sticky_menu_open,
        )
    } else {
        canonical_from_capture_dictation_origin(
            position,
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
        )
    };
    app_state.pill().set_overlay_position(canonical_position);
    Ok(OverlayPositionPayload {
        x: canonical_position.0,
        y: canonical_position.1,
    })
}

fn remember_position(
    x: i32,
    y: i32,
    app: AppHandle<AppRuntime>,
) -> Result<OverlayPositionPayload, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Overlay window not found.".to_string())?;
    // Ocultar la píldora la manda fuera de la pantalla, y eso dispara un
    // `onMoved`. Guardar esa posición la convierte en la preferida del
    // usuario: el siguiente `clamp` la pega a una esquina, el resultado se
    // vuelve a guardar y ya no hay forma de salir de ahí.
    if x <= OVERLAY_OFFSCREEN_LIMIT || y <= OVERLAY_OFFSCREEN_LIMIT {
        return Err("The overlay is off-screen; nothing to remember.".to_string());
    }
    let app_state = app.state::<AppState>();
    let meeting_surface = app_state.meeting_capture().is_active();
    let idle_sticky = !meeting_surface && app_state.pill().status() == PillStatus::Idle;
    let scale = window
        .scale_factor()
        .map_err(|err| format!("Failed to read overlay scale: {err}"))?;
    let sticky_menu_open = idle_sticky && *app_state.pill().preflight_language_menu_open.lock();
    let sticky_expanded = idle_sticky && app_state.pill().is_hovering();
    let settings = app_state.current_settings_unmasked();
    let logical_size = if meeting_surface {
        meeting_overlay_logical_size(app_state.pill().meeting_overlay_presentation())
    } else if idle_sticky {
        capture::sticky_window_size(sticky_expanded, sticky_menu_open)
    } else {
        (DICTATION_OVERLAY_WIDTH, DICTATION_OVERLAY_HEIGHT)
    };
    let physical_size = physical_overlay_size(logical_size, scale);
    // Y aunque esté en pantalla, tiene que caber en un display real antes de
    // convertirse en la posición canónica.
    let (x, y) = clamp_overlay_position(&window, x, y, physical_size)
        .ok_or_else(|| "No display is available for the overlay.".to_string())?;
    let canonical_position = if meeting_surface {
        canonical_meeting_overlay_origin(
            (x, y),
            scale,
            app_state.pill().meeting_overlay_presentation(),
        )
    } else if idle_sticky {
        capture::canonical_sticky_origin(
            (x, y),
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
            sticky_expanded,
            sticky_menu_open,
        )
    } else {
        canonical_from_capture_dictation_origin(
            (x, y),
            scale,
            settings.capture_pill_presentation,
            settings.capture_pill_dock_position,
        )
    };
    app_state.pill().set_overlay_position(canonical_position);
    Ok(OverlayPositionPayload {
        x: canonical_position.0,
        y: canonical_position.1,
    })
}

/// Commit the native frame before hover may change its presentation. Runs on the
/// main thread so release, canonical conversion and hover cannot interleave.
pub(super) fn finish_drag_if_released(app: &AppHandle<AppRuntime>) {
    if platform::overlay::primary_button_pressed() {
        return;
    }
    let drag_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        let state = drag_app.state::<AppState>();
        state
            .pill()
            .finish_drag(platform::overlay::primary_button_pressed(), || {
                let result = drag_app
                    .get_webview_window(MAIN_WINDOW_LABEL)
                    .ok_or_else(|| "Overlay window not found.".to_string())
                    .and_then(|window| window.outer_position().map_err(|error| error.to_string()))
                    .and_then(|position| {
                        remember_position(position.x, position.y, drag_app.clone())
                    });
                match result {
                    Ok(position) => {
                        if let Err(error) = drag_app.emit("pill:position", position) {
                            tracing::warn!("Failed to publish the final pill position: {error}");
                        }
                    }
                    Err(error) => {
                        tracing::warn!("Failed to remember the final pill position: {error}")
                    }
                }
            });
    });
}
