use crate::AppRuntime;
use tauri::{AppHandle, Manager, Monitor, WebviewWindow};

const TOAST_LOGICAL_SIZE: (f64, f64) = (420.0, 200.0);
const EDGE_INSET: f64 = 16.0;

/// El área utilizable del monitor en puntos, que es el espacio en el que
/// macOS coloca ventanas. Guardarla en píxeles obligaba a convertir dos veces
/// y una de las dos conversiones no era nuestra.
#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalArea {
    origin: (f64, f64),
    extent: (f64, f64),
}

pub(super) fn place_toast(app: &AppHandle<AppRuntime>, window: &WebviewWindow<AppRuntime>) {
    place_notification(app, window, TOAST_LOGICAL_SIZE);
}

/// La posición va en puntos, no en píxeles. Tauri convierte una
/// `PhysicalPosition` dividiéndola por la escala de *la ventana*, no por la
/// del monitor al que apunta: con un monitor externo a 1x y el portátil a 2x,
/// el aviso aterrizaba a mitad de camino y solo se recolocaba en el siguiente
/// sondeo. En puntos no queda conversión que equivocar.
pub(super) fn place_notification(
    app: &AppHandle<AppRuntime>,
    window: &WebviewWindow<AppRuntime>,
    logical_size: (f64, f64),
) {
    let Some(monitor) = preferred_monitor(app, window) else {
        return;
    };
    let area = logical_work_area(&monitor);
    let position = top_right_position(area, logical_size, EDGE_INSET);

    let _ = window.set_position(tauri::LogicalPosition::new(position.0, position.1));
}

fn logical_work_area(monitor: &Monitor) -> LogicalArea {
    let work_area = monitor.work_area();
    to_logical_area(
        (work_area.position.x, work_area.position.y),
        (work_area.size.width, work_area.size.height),
        monitor.scale_factor(),
    )
}

fn to_logical_area(origin: (i32, i32), extent: (u32, u32), scale: f64) -> LogicalArea {
    LogicalArea {
        origin: (f64::from(origin.0) / scale, f64::from(origin.1) / scale),
        extent: (f64::from(extent.0) / scale, f64::from(extent.1) / scale),
    }
}

fn top_right_position(area: LogicalArea, surface_size: (f64, f64), inset: f64) -> (f64, f64) {
    let minimum_x = area.origin.0 + inset;
    let proposed_x = area.origin.0 + area.extent.0 - surface_size.0 - inset;
    let y = area.origin.1 + inset;
    (proposed_x.max(minimum_x), y)
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
    use super::{to_logical_area, top_right_position, LogicalArea};

    #[test]
    fn a_retina_monitor_is_measured_in_points() {
        // Un portátil Retina reporta 3024x1964 píxeles para 1512x982 puntos.
        // Colocar el aviso con los píxeles lo mandaba al doble de distancia.
        assert_eq!(
            to_logical_area((0, -1964), (3024, 1900), 2.0),
            LogicalArea {
                origin: (0.0, -982.0),
                extent: (1512.0, 950.0),
            }
        );
        assert_eq!(
            to_logical_area((0, 31), (2560, 1409), 1.0),
            LogicalArea {
                origin: (0.0, 31.0),
                extent: (2560.0, 1409.0),
            }
        );
    }

    #[test]
    fn anchors_to_each_work_areas_top_right_corner() {
        let primary = LogicalArea {
            origin: (0.0, 24.0),
            extent: (1_920.0, 1_056.0),
        };
        let left = LogicalArea {
            origin: (-1_920.0, 24.0),
            extent: (1_920.0, 1_056.0),
        };

        assert_eq!(
            top_right_position(primary, (420.0, 200.0), 16.0),
            (1_484.0, 40.0)
        );
        assert_eq!(
            top_right_position(primary, (380.0, 72.0), 16.0),
            (1_524.0, 40.0)
        );
        assert_eq!(
            top_right_position(left, (420.0, 200.0), 16.0),
            (-436.0, 40.0)
        );
    }

    #[test]
    fn a_retina_monitors_corner_lands_in_points_not_pixels() {
        let retina = to_logical_area((0, -1964), (3024, 1900), 2.0);

        assert_eq!(
            top_right_position(retina, (420.0, 128.0), 16.0),
            (1_076.0, -966.0)
        );
    }

    #[test]
    fn narrow_work_areas_clamp_to_the_left_inset() {
        let narrow = LogicalArea {
            origin: (100.0, -20.0),
            extent: (300.0, 600.0),
        };

        assert_eq!(
            top_right_position(narrow, (420.0, 200.0), 16.0),
            (116.0, -4.0)
        );
    }
}
