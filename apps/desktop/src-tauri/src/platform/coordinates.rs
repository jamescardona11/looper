/// Tao reports the macOS cursor using the primary display's scale. Windows
/// reports cursor and window origins in the same physical desktop coordinates.
#[derive(Clone, Copy)]
pub(crate) enum CursorCoordinates {
    PrimaryMonitorScaled,
    DesktopPhysical,
}

type Point = (f64, f64);

impl CursorCoordinates {
    pub(crate) fn native() -> Self {
        if cfg!(target_os = "macos") {
            Self::PrimaryMonitorScaled
        } else {
            Self::DesktopPhysical
        }
    }

    pub(crate) fn to_shared_points(
        self,
        cursor: Point,
        primary_scale: f64,
        origin: Point,
        size: Point,
        target_scale: f64,
    ) -> (Point, Point, Point) {
        let target_scale = if target_scale > 0.0 {
            target_scale
        } else {
            1.0
        };
        let cursor_scale = match self {
            Self::PrimaryMonitorScaled if primary_scale > 0.0 => primary_scale,
            Self::PrimaryMonitorScaled => 1.0,
            Self::DesktopPhysical => target_scale,
        };
        (
            (cursor.0 / cursor_scale, cursor.1 / cursor_scale),
            (origin.0 / target_scale, origin.1 / target_scale),
            (size.0 / target_scale, size.1 / target_scale),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::CursorCoordinates;

    #[test]
    fn windows_pointer_stays_inside_a_pill_on_a_differently_scaled_monitor() {
        for (primary_scale, target_scale) in [(1.0, 2.0), (2.0, 1.0), (1.5, 1.25)] {
            let origin = (2800.0, 400.0);
            let cursor = (
                origin.0 + 48.0 * target_scale,
                origin.1 + 18.0 * target_scale,
            );
            let (cursor, origin, size) = CursorCoordinates::DesktopPhysical.to_shared_points(
                cursor,
                primary_scale,
                origin,
                (96.0 * target_scale, 36.0 * target_scale),
                target_scale,
            );
            assert_eq!(size, (96.0, 36.0));
            assert_eq!((cursor.0 - origin.0, cursor.1 - origin.1), (48.0, 18.0));
        }
    }

    #[test]
    fn windows_cursor_on_secondary_monitor_is_not_scaled_by_primary_monitor() {
        let (cursor, origin, size) = CursorCoordinates::DesktopPhysical.to_shared_points(
            (3000.0, 500.0),
            1.5,
            (2560.0, 0.0),
            (1920.0, 1080.0),
            1.0,
        );
        assert!(cursor.0 >= origin.0 && cursor.0 < origin.0 + size.0);
        assert!(cursor.1 >= origin.1 && cursor.1 < origin.1 + size.1);
    }
}
