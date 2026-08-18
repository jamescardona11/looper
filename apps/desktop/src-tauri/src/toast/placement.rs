use crate::AppRuntime;
use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

const TOAST_LOGICAL_SIZE: (f64, f64) = (420.0, 200.0);
const EDGE_INSET: f64 = 16.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct PhysicalArea {
    origin: (i32, i32),
    extent: (u32, u32),
}

pub(super) fn place_toast(app: &AppHandle<AppRuntime>, window: &WebviewWindow<AppRuntime>) {
    place_notification(app, window, TOAST_LOGICAL_SIZE);
}

pub(super) fn place_notification(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
) {
    let Some(monitor) = preferred_monitor(app, window) else {
        return;
    };
    let scale = monitor.scale_factor();
    let work_area = monitor.work_area();
    let area = PhysicalArea {
        origin: (work_area.position.x, work_area.position.y),
        extent: (work_area.size.width, work_area.size.height),
    };
    let surface_size = scale_pair(logical_size, scale);
    let inset = (EDGE_INSET * scale).round() as i32;
    let position = top_right_position(area, surface_size, inset);

    let _ = window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
}

fn scale_pair(logical: (f64, f64), factor: f64) -> (u32, u32) {
    (
        (logical.0 * factor).round() as u32,
        (logical.1 * factor).round() as u32,
    )
}

fn top_right_position(area: PhysicalArea, surface_size: (u32, u32), inset: i32) -> (i32, i32) {
    let minimum_x = i64::from(area.origin.0) + i64::from(inset);
    let proposed_x = i64::from(area.origin.0) + i64::from(area.extent.0)
        - i64::from(surface_size.0)
        - i64::from(inset);
    let y = i64::from(area.origin.1) + i64::from(inset);
    (proposed_x.max(minimum_x) as i32, y as i32)
}

fn preferred_monitor(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
) -> Option<Monitor> {
    main_window_monitor(app)
        .or_else(|| monitor_beneath_pointer(window))
        .or_else(|| window.current_monitor().ok().flatten())
}

fn main_window_monitor(app: &AppHandle<AppRuntime>) -> Option<Monitor> {
    app.get_webview_window(crate::MAIN_WINDOW_LABEL)
        .and_then(|window| window.current_monitor().ok().flatten())
}

fn monitor_beneath_pointer(window: &WebviewWindow<AppRuntime>) -> Option<Monitor> {
    let pointer = window.cursor_position().ok()?;
    let candidates = window.available_monitors().ok()?;
    candidates.into_iter().find(|monitor| {
        let origin = monitor.position();
        let extent = monitor.size();
        let horizontal = origin.x as f64..(origin.x + extent.width as i32) as f64;
        let vertical = origin.y as f64..(origin.y + extent.height as i32) as f64;
        horizontal.contains(&pointer.x) && vertical.contains(&pointer.y)
    })
}

#[cfg(test)]
mod tests {
    use super::{scale_pair, top_right_position, PhysicalArea};

    #[test]
    fn rounds_logical_dimensions_to_physical_pixels() {
        assert_eq!(scale_pair((420.0, 200.0), 1.25), (525, 250));
        assert_eq!(scale_pair((333.0, 71.0), 1.5), (500, 107));
    }

    #[test]
    fn anchors_to_each_work_areas_top_right_corner() {
        let primary = PhysicalArea {
            origin: (0, 24),
            extent: (1_920, 1_056),
        };
        let left = PhysicalArea {
            origin: (-1_920, 24),
            extent: (1_920, 1_056),
        };

        assert_eq!(top_right_position(primary, (420, 200), 16), (1_484, 40));
        assert_eq!(top_right_position(primary, (380, 72), 16), (1_524, 40));
        assert_eq!(top_right_position(left, (420, 200), 16), (-436, 40));
    }

    #[test]
    fn narrow_work_areas_clamp_to_the_left_inset() {
        let narrow = PhysicalArea {
            origin: (100, -20),
            extent: (300, 600),
        };

        assert_eq!(top_right_position(narrow, (420, 200), 16), (116, -4));
    }
}
