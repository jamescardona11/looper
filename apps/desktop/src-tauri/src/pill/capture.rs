use serde::{Deserialize, Serialize};

pub const WINDOW_WIDTH: f64 = 264.0;
pub const WINDOW_HEIGHT: f64 = 48.0;
pub const COMPACT_WINDOW_WIDTH: f64 = 96.0;
pub const COMPACT_WINDOW_HEIGHT: f64 = 36.0;
pub const LANGUAGE_MENU_WINDOW_HEIGHT: f64 = 242.0;
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
const SHELL_HEIGHT: f64 = WINDOW_HEIGHT;
/// The collapsed launcher mirrors the 96 × 36pt React surface. Its left 50pt
/// is the drag handle; the remaining area is the explicit expansion target.
const FLOATING_LAUNCHER_WIDTH: f64 = COMPACT_WINDOW_WIDTH;
const FLOATING_LAUNCHER_HEIGHT: f64 = COMPACT_WINDOW_HEIGHT;
const FLOATING_DRAG_HANDLE_WIDTH: f64 = 50.0;
/// Collapsing again takes a deliberate move away, not a pixel of jitter.
const HOVER_EXIT_MARGIN: f64 = 10.0;

/// Native geometry for the idle Capture pill.
///
/// `origin` is expressed in physical screen pixels because that is what Tauri
/// uses to position a window. `logical_size` is expressed in points because
/// `set_size` scales it for the target display.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct StickyWindowFrame {
    pub origin: (i32, i32),
    pub logical_size: (f64, f64),
}

fn compact_anchor_offset(
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
) -> (f64, f64) {
    let horizontal_inset = WINDOW_WIDTH - COMPACT_WINDOW_WIDTH;
    let vertical_inset = WINDOW_HEIGHT - COMPACT_WINDOW_HEIGHT;

    match presentation {
        CapturePillPresentation::Floating => (horizontal_inset / 2.0, vertical_inset / 2.0),
        CapturePillPresentation::Dock => match dock_position {
            CapturePillDockPosition::TopCenter => (horizontal_inset / 2.0, 0.0),
            CapturePillDockPosition::LeftCenter => (0.0, vertical_inset / 2.0),
            CapturePillDockPosition::RightCenter => (horizontal_inset, vertical_inset / 2.0),
            CapturePillDockPosition::BottomCenter => (horizontal_inset / 2.0, vertical_inset),
        },
    }
}

fn sticky_window_offset(
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    expanded: bool,
    language_menu_open: bool,
) -> (i32, i32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let logical_offset = if language_menu_open {
        if dock_position == CapturePillDockPosition::TopCenter {
            (0.0, 0.0)
        } else {
            (0.0, -(LANGUAGE_MENU_WINDOW_HEIGHT - WINDOW_HEIGHT))
        }
    } else if expanded {
        (0.0, 0.0)
    } else {
        compact_anchor_offset(presentation, dock_position)
    };

    (
        logical_pixels(logical_offset.0, scale),
        logical_pixels(logical_offset.1, scale),
    )
}

pub(crate) fn sticky_window_size(expanded: bool, language_menu_open: bool) -> (f64, f64) {
    if language_menu_open {
        (WINDOW_WIDTH, LANGUAGE_MENU_WINDOW_HEIGHT)
    } else if expanded {
        (WINDOW_WIDTH, WINDOW_HEIGHT)
    } else {
        (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT)
    }
}

/// Converts the stable, expanded-pill anchor into the actual native frame.
/// Shrinking the NSPanel now removes the gray WebView rectangle without
/// visually moving the pill on screen.
pub(crate) fn sticky_window_frame(
    canonical_origin: (i32, i32),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    expanded: bool,
    language_menu_open: bool,
) -> StickyWindowFrame {
    let offset = sticky_window_offset(
        scale,
        presentation,
        dock_position,
        expanded,
        language_menu_open,
    );
    StickyWindowFrame {
        origin: (
            canonical_origin.0.saturating_add(offset.0),
            canonical_origin.1.saturating_add(offset.1),
        ),
        logical_size: sticky_window_size(expanded, language_menu_open),
    }
}

/// Inverse of `sticky_window_frame`, used after a drag so persisted positions
/// keep the same stable anchor regardless of the current compact/expanded
/// frame.
pub(crate) fn canonical_sticky_origin(
    actual_origin: (i32, i32),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
    expanded: bool,
    language_menu_open: bool,
) -> (i32, i32) {
    let offset = sticky_window_offset(
        scale,
        presentation,
        dock_position,
        expanded,
        language_menu_open,
    );
    (
        actual_origin.0.saturating_sub(offset.0),
        actual_origin.1.saturating_sub(offset.1),
    )
}

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
            let width = FLOATING_LAUNCHER_WIDTH * scale;
            let height = FLOATING_LAUNCHER_HEIGHT * scale;
            Rect {
                x: (window_size.0 - width) / 2.0,
                y: (window_size.1 - height) / 2.0,
                width,
                height,
            }
        }
        CapturePillPresentation::Dock => {
            let width = FLOATING_LAUNCHER_WIDTH * scale;
            let height = FLOATING_LAUNCHER_HEIGHT * scale;
            match dock_position {
                CapturePillDockPosition::TopCenter => Rect {
                    x: (window_size.0 - width) / 2.0,
                    y: 0.0,
                    width,
                    height,
                },
                CapturePillDockPosition::LeftCenter => Rect {
                    x: 0.0,
                    y: (window_size.1 - height) / 2.0,
                    width,
                    height,
                },
                CapturePillDockPosition::RightCenter => Rect {
                    x: window_size.0 - width,
                    y: (window_size.1 - height) / 2.0,
                    width,
                    height,
                },
                CapturePillDockPosition::BottomCenter => Rect {
                    x: (window_size.0 - width) / 2.0,
                    y: window_size.1 - height,
                    width,
                    height,
                },
            }
        }
    }
}

/// The part of a collapsed pill that can open the dock. The handle stays
/// interactive for dragging, but does not count as hover intent.
fn expand_rect(
    window_size: (f64, f64),
    scale: f64,
    presentation: CapturePillPresentation,
    dock_position: CapturePillDockPosition,
) -> Rect {
    let collapsed = collapsed_rect(window_size, scale, presentation, dock_position);
    if presentation != CapturePillPresentation::Floating {
        return collapsed;
    }

    let handle = FLOATING_DRAG_HANDLE_WIDTH * scale;
    Rect {
        x: collapsed.x + handle,
        y: collapsed.y,
        width: collapsed.width - handle,
        height: collapsed.height,
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
        .union(expanded_rect(
            window_size,
            scale,
            presentation,
            dock_position,
        ))
        .inflate(HOVER_EXIT_MARGIN * scale)
}

/// Puts a cursor reading and a window frame into one coordinate space.
///
/// The window toolkit measures them with two different rulers: the cursor is
/// scaled by the PRIMARY screen's factor, window geometry by the factor of the
/// screen the window sits on. On a single-density desktop the two agree and
/// nothing shows. Put a 2x display next to a 1x primary and they disagree by
/// that factor, so subtracting one from the other lands the pill's hit area
/// off-screen and the pill stops answering the pointer entirely.
///
/// Logical points are the space that stays continuous across both, so every
/// hit test is done there - which is why the rects above are in points and
/// take a scale of 1.
pub fn to_shared_points(
    cursor: (f64, f64),
    cursor_scale: f64,
    origin: (f64, f64),
    size: (f64, f64),
    window_scale: f64,
) -> ((f64, f64), (f64, f64), (f64, f64)) {
    let cursor_scale = if cursor_scale > 0.0 {
        cursor_scale
    } else {
        1.0
    };
    let window_scale = if window_scale > 0.0 {
        window_scale
    } else {
        1.0
    };
    (
        (cursor.0 / cursor_scale, cursor.1 / cursor_scale),
        (origin.0 / window_scale, origin.1 / window_scale),
        (size.0 / window_scale, size.1 / window_scale),
    )
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

pub fn hover_target(
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
        expand_rect(window_size, scale, presentation, dock_position).contains(cursor)
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

    fn visual_anchor(
        origin: (i32, i32),
        size: (u32, u32),
        presentation: CapturePillPresentation,
        dock: CapturePillDockPosition,
    ) -> (i32, i32) {
        let width = i32::try_from(size.0).unwrap();
        let height = i32::try_from(size.1).unwrap();
        match presentation {
            CapturePillPresentation::Floating => (origin.0 + width / 2, origin.1 + height / 2),
            CapturePillPresentation::Dock => match dock {
                CapturePillDockPosition::TopCenter => (origin.0 + width / 2, origin.1),
                CapturePillDockPosition::LeftCenter => (origin.0, origin.1 + height / 2),
                CapturePillDockPosition::RightCenter => (origin.0 + width, origin.1 + height / 2),
                CapturePillDockPosition::BottomCenter => (origin.0 + width / 2, origin.1 + height),
            },
        }
    }

    #[test]
    fn docks_at_each_center_without_using_screen_corners() {
        let work_origin = (-1_920, 25);
        let work_size = (1_920, 1_055);
        let window_size = (WINDOW_WIDTH as u32, WINDOW_HEIGHT as u32);

        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::TopCenter,
            ),
            (-1_092, 33)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::LeftCenter,
            ),
            (-1_912, 528)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::RightCenter,
            ),
            (-272, 528)
        );
        assert_eq!(
            dock_origin(
                work_origin,
                work_size,
                window_size,
                8,
                CapturePillDockPosition::BottomCenter,
            ),
            (-1_092, 1_024)
        );
    }

    #[test]
    fn collapsed_native_frame_is_the_exact_launcher_not_the_expanded_webview() {
        let canonical = (400, 700);
        for (presentation, dock) in EVERY_PLACEMENT {
            for scale in [1.0, 2.0] {
                let compact =
                    sticky_window_frame(canonical, scale, presentation, dock, false, false);
                let expanded =
                    sticky_window_frame(canonical, scale, presentation, dock, true, false);

                assert_eq!(
                    compact.logical_size,
                    (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT)
                );
                assert_eq!(expanded.logical_size, (WINDOW_WIDTH, WINDOW_HEIGHT));
                assert_eq!(
                    visual_anchor(
                        compact.origin,
                        physical_size(compact.logical_size, scale),
                        presentation,
                        dock,
                    ),
                    visual_anchor(
                        expanded.origin,
                        physical_size(expanded.logical_size, scale),
                        presentation,
                        dock,
                    ),
                    "{presentation:?}/{dock:?} moved its visual anchor at {scale}x",
                );
                assert_eq!(
                    canonical_sticky_origin(
                        compact.origin,
                        scale,
                        presentation,
                        dock,
                        false,
                        false,
                    ),
                    canonical,
                );
            }
        }
    }

    #[test]
    fn dock_launcher_occupies_the_whole_compact_native_frame() {
        let size = (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT);
        assert!(hit_test(
            (0.0, 0.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(hit_test(
            (95.0, 35.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(!hit_test(
            (96.0, 18.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
    }

    #[test]
    fn floating_drag_handle_is_interactive_without_triggering_expansion() {
        let size = (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT);
        let presentation = CapturePillPresentation::Floating;
        let dock = CapturePillDockPosition::BottomCenter;

        // Left area: logo + six dots. It must receive the pointer for a drag
        // but never become hover intent.
        let handle = (20.0, 18.0);
        assert!(hit_test(handle, size, 1.0, presentation, dock, false));
        assert!(!hover_target(handle, size, 1.0, presentation, dock, false));

        // The expand zone begins immediately after the visible grip; there is
        // no inert strip between the logo and the opening target.
        let just_after_handle = (50.0, 18.0);
        assert!(hover_target(
            just_after_handle,
            size,
            1.0,
            presentation,
            dock,
            false,
        ));

        // Right area: Looper label and status dot. This is the only entry
        // target for opening the full capture dock.
        let opener = (75.0, 18.0);
        assert!(hit_test(opener, size, 1.0, presentation, dock, false));
        assert!(hover_target(opener, size, 1.0, presentation, dock, false));
    }

    /// The oscillation guard. Every point that expands the pill must still be
    /// inside the resized native window, or hover flips back and forth forever.
    #[test]
    fn expanding_never_moves_the_pointer_out_of_the_pill() {
        let canonical = (400, 700);
        for (presentation, dock) in EVERY_PLACEMENT {
            for scale in [1.0, 2.0] {
                let compact =
                    sticky_window_frame(canonical, scale, presentation, dock, false, false);
                let expanded =
                    sticky_window_frame(canonical, scale, presentation, dock, true, false);
                let enter = expand_rect(compact.logical_size, 1.0, presentation, dock);
                for corner in [
                    (enter.x, enter.y),
                    (enter.x + enter.width - 1.0, enter.y),
                    (enter.x, enter.y + enter.height - 1.0),
                    (enter.x + enter.width - 1.0, enter.y + enter.height - 1.0),
                ] {
                    let global = (
                        f64::from(compact.origin.0) + corner.0 * scale,
                        f64::from(compact.origin.1) + corner.1 * scale,
                    );
                    let expanded_cursor = (
                        (global.0 - f64::from(expanded.origin.0)) / scale,
                        (global.1 - f64::from(expanded.origin.1)) / scale,
                    );
                    assert!(
                        hit_test(
                            expanded_cursor,
                            expanded.logical_size,
                            1.0,
                            presentation,
                            dock,
                            true,
                        ),
                        "{presentation:?}/{dock:?} at {scale}x drops {global:?} on native resize",
                    );
                }
            }
        }
    }

    /// Regression: a pill dragged onto a 2x display beside a 1x primary became
    /// unreachable. The toolkit reported the cursor in the primary's scale and
    /// the window in the Retina's, so the pointer appeared to be 1444pt above
    /// a pill it was sitting exactly on top of.
    #[test]
    fn a_retina_screen_beside_a_1x_primary_keeps_the_pill_reachable() {
        // The compact pill sits at logical (254, 1474) on the 2x screen; the
        // pointer is dead centre on it at logical (302, 1492).
        let (cursor, origin, size) = to_shared_points(
            (302.0, 1492.0), // cursor, scaled by the 1x primary
            1.0,
            (508.0, 2948.0), // window origin, scaled by the 2x screen
            (192.0, 72.0),
            2.0,
        );

        assert_eq!(cursor, (302.0, 1492.0));
        assert_eq!(origin, (254.0, 1474.0));
        assert_eq!(size, (96.0, 36.0));
        assert!(hit_test(
            (cursor.0 - origin.0, cursor.1 - origin.1),
            size,
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
    }

    #[test]
    fn a_uniform_desktop_is_left_exactly_as_it_was() {
        let (cursor, origin, size) =
            to_shared_points((302.0, 1492.0), 1.0, (254.0, 1474.0), (96.0, 36.0), 1.0);

        assert_eq!(cursor, (302.0, 1492.0));
        assert_eq!(origin, (254.0, 1474.0));
        assert_eq!(size, (96.0, 36.0));
    }

    /// No dead pixels: everything the user can see of the expanded pill still
    /// answers the pointer, so the shell never has an inert strip along an edge.
    #[test]
    fn the_whole_painted_shell_keeps_the_pill_expanded() {
        let size = (WINDOW_WIDTH, WINDOW_HEIGHT);
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
    /// used to be pinned to the bottom, so its top edge expanded and
    /// immediately collapsed again.
    #[test]
    fn the_floating_pills_top_edge_stays_expanded() {
        let size = (WINDOW_WIDTH, WINDOW_HEIGHT);
        let top_edge = (WINDOW_WIDTH / 2.0, 0.0);
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
        let size = (WINDOW_WIDTH, WINDOW_HEIGHT);
        let just_outside = (WINDOW_WIDTH / 2.0, WINDOW_HEIGHT + 2.0);

        assert!(hit_test(
            just_outside,
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            true,
        ));
        assert!(!hit_test(
            (WINDOW_WIDTH / 2.0, WINDOW_HEIGHT + 12.0),
            size,
            1.0,
            CapturePillPresentation::Dock,
            CapturePillDockPosition::BottomCenter,
            true,
        ));
    }

    #[test]
    fn floating_mode_activates_only_from_the_compact_native_frame() {
        assert!(hit_test(
            (75.0, 18.0),
            (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT),
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
        assert!(!hit_test(
            (97.0, 18.0),
            (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT),
            1.0,
            CapturePillPresentation::Floating,
            CapturePillDockPosition::BottomCenter,
            false,
        ));
    }

    #[test]
    fn language_menu_keeps_the_pill_at_the_same_global_y() {
        let canonical = (400, 700);

        for (presentation, dock) in EVERY_PLACEMENT {
            let closed = sticky_window_frame(canonical, 1.0, presentation, dock, true, false);
            let open = sticky_window_frame(canonical, 1.0, presentation, dock, true, true);
            let open_shell_top = if dock == CapturePillDockPosition::TopCenter {
                open.origin.1
            } else {
                open.origin.1 + (LANGUAGE_MENU_WINDOW_HEIGHT - WINDOW_HEIGHT) as i32
            };

            assert_eq!(
                closed.origin,
                (open.origin.0, open_shell_top),
                "{presentation:?}/{dock:?} moved when Language opened",
            );
            assert_eq!(
                canonical_sticky_origin(open.origin, 1.0, presentation, dock, true, true),
                canonical,
            );
        }
    }
}
