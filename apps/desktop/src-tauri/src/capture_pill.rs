use serde::{Deserialize, Serialize};

pub const WINDOW_WIDTH: f64 = 260.0;
pub const WINDOW_HEIGHT: f64 = 60.0;
pub const EDGE_MARGIN: f64 = 8.0;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapturePillPresentation {
    #[default]
    Dock,
    Floating,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapturePillDockPosition {
    TopCenter,
    LeftCenter,
    RightCenter,
    #[default]
    BottomCenter,
}

impl CapturePillDockPosition {
    pub fn menu_value(self) -> &'static str {
        match self {
            Self::TopCenter => "top_center",
            Self::LeftCenter => "left_center",
            Self::RightCenter => "right_center",
            Self::BottomCenter => "bottom_center",
        }
    }
}

pub fn dock_origin(
    work_origin: (i32, i32),
    work_size: (u32, u32),
    window_size: (u32, u32),
    margin: i32,
    position: CapturePillDockPosition,
) -> (i32, i32) {
    let work_width = i32::try_from(work_size.0).unwrap_or(i32::MAX);
    let work_height = i32::try_from(work_size.1).unwrap_or(i32::MAX);
    let window_width = i32::try_from(window_size.0).unwrap_or(i32::MAX);
    let window_height = i32::try_from(window_size.1).unwrap_or(i32::MAX);
    let centered_x = work_origin.0 + (work_width - window_width) / 2;
    let centered_y = work_origin.1 + (work_height - window_height) / 2;

    match position {
        CapturePillDockPosition::TopCenter => (centered_x, work_origin.1 + margin),
        CapturePillDockPosition::LeftCenter => (work_origin.0 + margin, centered_y),
        CapturePillDockPosition::RightCenter => (
            work_origin.0 + work_width - window_width - margin,
            centered_y,
        ),
        CapturePillDockPosition::BottomCenter => (
            centered_x,
            work_origin.1 + work_height - window_height - margin,
        ),
    }
}

pub fn hit_test(
    cursor: (f64, f64),
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    expanded: bool,
) -> bool {
    if expanded {
        let shell_height = 48.0 * scale;
        let shell_top = match dock_position {
            CapturePillDockPosition::TopCenter => 0.0,
            CapturePillDockPosition::LeftCenter | CapturePillDockPosition::RightCenter => {
                (window_size.1 - shell_height) / 2.0
            }
            CapturePillDockPosition::BottomCenter => window_size.1 - shell_height,
        };
        return point_in_rect(cursor, (0.0, shell_top), (window_size.0, shell_height));
    }

    match presentation {
        CapturePillPresentation::Floating => {
            let size = 48.0 * scale;
            point_in_rect(
                cursor,
                ((window_size.0 - size) / 2.0, (window_size.1 - size) / 2.0),
                (size, size),
            )
        }
        CapturePillPresentation::Dock => {
            let long = 64.0 * scale;
            let short = 20.0 * scale;
            match dock_position {
                CapturePillDockPosition::TopCenter => {
                    point_in_rect(cursor, ((window_size.0 - long) / 2.0, 0.0), (long, short))
                }
                CapturePillDockPosition::LeftCenter => {
                    point_in_rect(cursor, (0.0, (window_size.1 - long) / 2.0), (short, long))
                }
                CapturePillDockPosition::RightCenter => point_in_rect(
                    cursor,
                    (window_size.0 - short, (window_size.1 - long) / 2.0),
                    (short, long),
                ),
                CapturePillDockPosition::BottomCenter => point_in_rect(
                    cursor,
                    ((window_size.0 - long) / 2.0, window_size.1 - short),
                    (long, short),
                ),
            }
        }
    }
}

pub(crate) fn closest_monitor_index(
    point: (i32, i32),
    monitors: &[(i32, i32, u32, u32)],
) -> Option<usize> {
    monitors
        .iter()
        .enumerate()
        .min_by_key(|(_, monitor)| squared_distance_to_rect(point, **monitor))
        .map(|(index, _)| index)
}

pub(crate) fn points_share_closest_monitor(
    first: (i32, i32),
    second: (i32, i32),
    monitors: &[(i32, i32, u32, u32)],
) -> bool {
    closest_monitor_index(first, monitors)
        .zip(closest_monitor_index(second, monitors))
        .is_some_and(|(first, second)| first == second)
}

pub(crate) fn logical_pixels(value: f64, scale: f64) -> i32 {
    (value * scale).round() as i32
}

pub(crate) fn physical_size(logical_size: (f64, f64), scale: f64) -> (u32, u32) {
    (
        logical_pixels(logical_size.0, scale).max(0) as u32,
        logical_pixels(logical_size.1, scale).max(0) as u32,
    )
}

pub(crate) fn clamp_coordinates(
    x: i32,
    y: i32,
    window_size: (u32, u32),
    monitor_position: (i32, i32),
    monitor_size: (u32, u32),
) -> (i32, i32) {
    let min_x = i64::from(monitor_position.0);
    let min_y = i64::from(monitor_position.1);
    let max_x = (min_x + i64::from(monitor_size.0) - i64::from(window_size.0)).max(min_x);
    let max_y = (min_y + i64::from(monitor_size.1) - i64::from(window_size.1)).max(min_y);
    (
        i64::from(x).clamp(min_x, max_x) as i32,
        i64::from(y).clamp(min_y, max_y) as i32,
    )
}

fn squared_distance_to_rect(point: (i32, i32), rect: (i32, i32, u32, u32)) -> i64 {
    let min_x = i64::from(rect.0);
    let min_y = i64::from(rect.1);
    let max_x = min_x + i64::from(rect.2);
    let max_y = min_y + i64::from(rect.3);
    let x = i64::from(point.0);
    let y = i64::from(point.1);
    let dx = if x < min_x {
        min_x - x
    } else if x >= max_x {
        x - max_x + 1
    } else {
        0
    };
    let dy = if y < min_y {
        min_y - y
    } else if y >= max_y {
        y - max_y + 1
    } else {
        0
    };
    dx * dx + dy * dy
}

fn point_in_rect(point: (f64, f64), origin: (f64, f64), size: (f64, f64)) -> bool {
    point.0 >= origin.0
        && point.0 < origin.0 + size.0
        && point.1 >= origin.1
        && point.1 < origin.1 + size.1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docks_at_each_center_without_using_screen_corners() {
        let work_origin = (-1_920, 25);
        let work_size = (1_920, 1_055);
        let window_size = (260, 60);

        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::TopCenter,
            ),
            (-1_090, 33)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::LeftCenter,
            ),
            (-1_912, 522)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::RightCenter,
            ),
            (-268, 522)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::BottomCenter,
            ),
            (-1_090, 1_012)
        );
    }

    #[test]
    fn dock_handle_expands_the_hit_area_to_the_full_pill() {
        let size = (260.0, 60.0);
        assert!(hit_test(
            (130.0, 59.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(!hit_test(
            (130.0, 30.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(hit_test(
            (10.0, 30.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            true,
        ));
    }

    #[test]
    fn floating_mode_activates_from_the_collapsed_circle() {
        assert!(hit_test(
            (130.0, 30.0),
            (260.0, 60.0),
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(!hit_test(
            (20.0, 30.0),
            (260.0, 60.0),
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
    }
}
