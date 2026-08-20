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

/// Height of the expanded shell painted by `resolveDockLayout`.
const SHELL_HEIGHT: f64 = 48.0;
/// The collapsed floating launcher is a 44pt circle; the extra points keep it
/// reachable without widening what the user sees.
const FLOATING_LAUNCHER_SIZE: f64 = 48.0;
/// The docked edge handle is painted 44x6; its active area is grown so a 6pt
/// sliver stays hittable.
const DOCK_HANDLE_LONG: f64 = 64.0;
const DOCK_HANDLE_SHORT: f64 = 20.0;
/// Collapsing again takes a deliberate move away, not a pixel of jitter.
const HOVER_EXIT_MARGIN: f64 = 10.0;

#[derive(Debug, Clone, Copy, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Rect {
    fn contains(self, point: (f64, f64)) -> bool {
        point.0 >= self.x
            && point.0 < self.x + self.width
            && point.1 >= self.y
            && point.1 < self.y + self.height
    }

    fn union(self, other: Self) -> Self {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        Self {
            x,
            y,
            width: (self.x + self.width).max(other.x + other.width) - x,
            height: (self.y + self.height).max(other.y + other.height) - y,
        }
    }

    fn inflate(self, margin: f64) -> Self {
        Self {
            x: self.x - margin,
            y: self.y - margin,
            width: self.width + margin * 2.0,
            height: self.height + margin * 2.0,
        }
    }
}

/// What the pointer must reach to expand the pill: exactly what is painted
/// while collapsed.
fn collapsed_rect(
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
) -> Rect {
    match presentation {
        CapturePillPresentation::Floating => {
            let size = FLOATING_LAUNCHER_SIZE * scale;
            Rect {
                x: (window_size.0 - size) / 2.0,
                y: (window_size.1 - size) / 2.0,
                width: size,
                height: size,
            }
        }
        CapturePillPresentation::Dock => {
            let long = DOCK_HANDLE_LONG * scale;
            let short = DOCK_HANDLE_SHORT * scale;
            match dock_position {
                CapturePillDockPosition::TopCenter => Rect {
                    x: (window_size.0 - long) / 2.0,
                    y: 0.0,
                    width: long,
                    height: short,
                },
                CapturePillDockPosition::LeftCenter => Rect {
                    x: 0.0,
                    y: (window_size.1 - long) / 2.0,
                    width: short,
                    height: long,
                },
                CapturePillDockPosition::RightCenter => Rect {
                    x: window_size.0 - short,
                    y: (window_size.1 - long) / 2.0,
                    width: short,
                    height: long,
                },
                CapturePillDockPosition::BottomCenter => Rect {
                    x: (window_size.0 - long) / 2.0,
                    y: window_size.1 - short,
                    width: long,
                    height: short,
                },
            }
        }
    }
}

/// Where the expanded shell actually lands. Mirrors `shellPlacement` in
/// `pill-preflight-layout.ts`: floating and the side docks centre the shell,
/// the top and bottom docks pin it to their edge.
fn expanded_rect(
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
) -> Rect {
    let height = SHELL_HEIGHT * scale;
    let centered = (window_size.1 - height) / 2.0;
    let y = match presentation {
        CapturePillPresentation::Floating => centered,
        CapturePillPresentation::Dock => match dock_position {
            CapturePillDockPosition::TopCenter => 0.0,
            CapturePillDockPosition::BottomCenter => window_size.1 - height,
            CapturePillDockPosition::LeftCenter | CapturePillDockPosition::RightCenter => centered,
        },
    };
    Rect {
        x: 0.0,
        y,
        width: window_size.0,
        height,
    }
}

/// The area the pointer has to leave before the pill collapses again.
///
/// It is the union of both painted states plus a margin, which makes it a
/// superset of the area that expanded the pill in the first place. Without
/// that guarantee, expanding can push the pointer outside its own hit area and
/// the pill oscillates - that was the flicker along the floating pill's top
/// edge, where the collapsed circle sat 6pt above the expanded shell.
fn exit_rect(
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
) -> Rect {
    collapsed_rect(window_size, scale, presentation, dock_position)
        .union(expanded_rect(window_size, scale, presentation, dock_position))
        .inflate(HOVER_EXIT_MARGIN * scale)
}

pub fn hit_test(
    cursor: (f64, f64),
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    hovering: bool,
) -> bool {
    if hovering {
        exit_rect(window_size, scale, presentation, dock_position).contains(cursor)
    } else {
        collapsed_rect(window_size, scale, presentation, dock_position).contains(cursor)
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

    const EVERY_PLACEMENT: [(CapturePillPresentation, CapturePillDockPosition); 8] = [
        (
            CapturePillPresentation::Dock,
            CapturePillDockPosition::TopCenter,
        ),
        (
            CapturePillPresentation::Dock,
            CapturePillDockPosition::LeftCenter,
        ),
        (
            CapturePillPresentation::Dock,
            CapturePillDockPosition::RightCenter,
        ),
        (
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
        ),
        (
            CapturePillPresentation::Floating,
            CapturePillDockPosition::TopCenter,
        ),
        (
            CapturePillPresentation::Floating,
            CapturePillDockPosition::LeftCenter,
        ),
        (
            CapturePillPresentation::Floating,
            CapturePillDockPosition::RightCenter,
        ),
        (
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
        ),
    ];

    /// The oscillation guard. Every point that expands the pill must still be
    /// inside it once expanded, or hover flips back and forth forever.
    #[test]
    fn expanding_never_moves_the_pointer_out_of_the_pill() {
        let size = (260.0, 60.0);
        for (presentation, dock) in EVERY_PLACEMENT {
            for scale in [1.0, 2.0] {
                let window = (size.0 * scale, size.1 * scale);
                let enter = collapsed_rect(window, scale, presentation, dock);
                let exit = exit_rect(window, scale, presentation, dock);
                for corner in [
                    (enter.x, enter.y),
                    (enter.x + enter.width - 1.0, enter.y),
                    (enter.x, enter.y + enter.height - 1.0),
                    (enter.x + enter.width - 1.0, enter.y + enter.height - 1.0),
                ] {
                    assert!(
                        exit.contains(corner),
                        "{presentation:?}/{dock:?} at {scale}x drops {corner:?} on expand",
                    );
                    assert!(hit_test(corner, window, scale, presentation, dock, false));
                    assert!(hit_test(corner, window, scale, presentation, dock, true));
                }
            }
        }
    }

    /// No dead pixels: everything the user can see of the expanded pill still
    /// answers the pointer, so the shell never has an inert strip along an edge.
    #[test]
    fn the_whole_painted_shell_keeps_the_pill_expanded() {
        let size = (260.0, 60.0);
        for (presentation, dock) in EVERY_PLACEMENT {
            let shell = expanded_rect(size, 1.0, presentation, dock);
            for corner in [
                (shell.x, shell.y),
                (shell.x + shell.width - 1.0, shell.y),
                (shell.x, shell.y + shell.height - 1.0),
                (shell.x + shell.width - 1.0, shell.y + shell.height - 1.0),
            ] {
                assert!(
                    hit_test(corner, size, 1.0, presentation, dock, true),
                    "{presentation:?}/{dock:?} leaves {corner:?} inert while expanded",
                );
            }
        }
    }

    /// Regression: the floating launcher is centred while the expanded shell
    /// used to be pinned to the bottom, so the pill's top 6pt expanded and
    /// immediately collapsed again.
    #[test]
    fn the_floating_pills_top_edge_stays_expanded() {
        let size = (260.0, 60.0);
        let top_edge = (130.0, 8.0);

        assert!(hit_test(
            top_edge,
            size,
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(hit_test(
            top_edge,
            size,
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            true,
        ));
    }

    #[test]
    fn leaving_the_pill_needs_more_than_a_pixel_of_jitter() {
        let size = (260.0, 60.0);
        let just_outside = (130.0, 62.0);

        assert!(hit_test(
            just_outside,
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            true,
        ));
        assert!(!hit_test(
            (130.0, 78.0),
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
