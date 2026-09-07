use crate::AppRuntime;
use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

const TOAST_LOGICAL_SIZE: (f64, f64) = (420.0, 200.0);
const EDGE_INSET: f64 = 16.0;

/// El área utilizable del monitor en píxeles físicos. La posición final debe
/// usar la escala del monitor de destino, no la escala que todavía conserva
/// el panel mientras está estacionado en otra pantalla.
#[derive(Clone, Copy, Debug, PartialEq)]
struct PhysicalArea {
    origin: (f64, f64),
    extent: (f64, f64),
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
    let area = physical_work_area(&monitor);
    let position = top_right_position(area, logical_size, EDGE_INSET, monitor.scale_factor());

    let _ = window.set_position(tauri::PhysicalPosition::new(position.0, position.1));
}

fn physical_work_area(monitor: &Monitor) -> PhysicalArea {
    let work_area = monitor.work_area();
    PhysicalArea {
        origin: (
            f64::from(work_area.position.x),
            f64::from(work_area.position.y),
        ),
        extent: (
            f64::from(work_area.size.width),
            f64::from(work_area.size.height),
        ),
    }
}

fn top_right_position(
    area: PhysicalArea,
    logical_surface_size: (f64, f64),
    logical_inset: f64,
    target_scale: f64,
) -> (f64, f64) {
    let surface_width = logical_surface_size.0 * target_scale;
    let inset = logical_inset * target_scale;
    let minimum_x = area.origin.0 + inset;
    let proposed_x = area.origin.0 + area.extent.0 - surface_width - inset;
    let y = area.origin.1 + inset;
    (proposed_x.max(minimum_x), y)
}

fn preferred_monitor(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
) -> Option<Monitor> {
    monitor_beneath_pointer(window)
        .or_else(|| main_window_monitor(app))
        .or_else(|| window.current_monitor().ok().flatten())
}

fn main_window_monitor(app: &AppHandle<AppRuntime>) -> Option<Monitor> {
    app.get_webview_window(crate::MAIN_WINDOW_LABEL)
        .and_then(|window| window.current_monitor().ok().flatten())
}

fn monitor_beneath_pointer(window: &WebviewWindow<AppRuntime>) -> Option<Monitor> {
    let pointer = window.cursor_position().ok()?;
    let candidates = window.available_monitors().ok()?;
    let pointer_scale = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| monitor.scale_factor())
        .unwrap_or_else(|| window.scale_factor().unwrap_or(1.0));
    let pointer = (pointer.x / pointer_scale, pointer.y / pointer_scale);
    candidates.into_iter().find(|monitor| {
        let origin = monitor.position();
        let extent = monitor.size();
        let scale = monitor.scale_factor();
        let left = f64::from(origin.x) / scale;
        let top = f64::from(origin.y) / scale;
        pointer.0 >= left
            && pointer.0 < left + f64::from(extent.width) / scale
            && pointer.1 >= top
            && pointer.1 < top + f64::from(extent.height) / scale
    })
}

#[cfg(test)]
mod tests {
    use super::{top_right_position, PhysicalArea};

    #[test]
    fn anchors_to_each_work_areas_top_right_corner() {
        let primary = PhysicalArea {
            origin: (0.0, 24.0),
            extent: (1_920.0, 1_056.0),
        };
        let left = PhysicalArea {
            origin: (-1_920.0, 24.0),
            extent: (1_920.0, 1_056.0),
        };

        assert_eq!(
            top_right_position(primary, (420.0, 200.0), 16.0, 1.0),
            (1_484.0, 40.0)
        );
        assert_eq!(
            top_right_position(primary, (380.0, 72.0), 16.0, 1.0),
            (1_524.0, 40.0)
        );
        assert_eq!(
            top_right_position(left, (420.0, 200.0), 16.0, 1.0),
            (-436.0, 40.0)
        );
    }

    #[test]
    fn a_retina_monitors_corner_uses_the_target_scale() {
        let retina = PhysicalArea {
            origin: (0.0, -1964.0),
            extent: (3024.0, 1900.0),
        };

        assert_eq!(
            top_right_position(retina, (420.0, 128.0), 16.0, 2.0),
            (2_152.0, -1_932.0)
        );
    }

    #[test]
    fn a_notification_targeting_retina_does_not_land_at_half_width() {
        let retina = PhysicalArea {
            origin: (0.0, 0.0),
            extent: (3024.0, 1900.0),
        };

        assert_eq!(
            top_right_position(retina, (420.0, 88.0), 16.0, 2.0),
            (2_152.0, 32.0),
        );
    }

    #[test]
    fn narrow_work_areas_clamp_to_the_left_inset() {
        let narrow = PhysicalArea {
            origin: (100.0, -20.0),
            extent: (300.0, 600.0),
        };

        assert_eq!(
            top_right_position(narrow, (420.0, 200.0), 16.0, 1.0),
            (116.0, -4.0)
        );
    }
}
