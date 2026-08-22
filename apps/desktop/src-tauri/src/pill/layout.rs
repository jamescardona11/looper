use super::{
    MeetingOverlayGeometry, MeetingOverlayPresentation, MeetingTranscriptPlacement,
    MeetingTranscriptSideAlignment, DICTATION_PILL_INSET_X, DICTATION_PILL_INSET_Y,
    MEETING_COMPACT_PILL_SIZE, MEETING_OVERLAY_GAP, MEETING_OVERLAY_HEIGHT, MEETING_OVERLAY_WIDTH,
    MEETING_PILL_ABOVE_INSET_X, MEETING_PILL_GUTTER, MEETING_PILL_HEIGHT, MEETING_PILL_SLOT_WIDTH,
    MEETING_TRANSCRIPT_ABOVE_HEIGHT, MEETING_TRANSCRIPT_ABOVE_WIDTH, MEETING_TRANSCRIPT_HEIGHT,
    MEETING_TRANSCRIPT_SIDE_HEIGHT, MEETING_TRANSCRIPT_SIDE_WIDTH, MEETING_TRANSCRIPT_WIDTH,
};
use super::capture::{clamp_coordinates as clamp_overlay_coordinates, logical_pixels};

/// Converts the visible pill anchor into the larger dictation window origin.
pub(super) fn dictation_origin_from_canonical(canonical: (i32, i32), scale: f64) -> (i32, i32) {
    (
        canonical.0 - logical_pixels(DICTATION_PILL_INSET_X, scale),
        canonical.1 - logical_pixels(DICTATION_PILL_INSET_Y, scale),
    )
}

/// Converts the dictation window origin back into the visible pill anchor.
pub(super) fn canonical_from_dictation_origin(origin: (i32, i32), scale: f64) -> (i32, i32) {
    (
        origin.0 + logical_pixels(DICTATION_PILL_INSET_X, scale),
        origin.1 + logical_pixels(DICTATION_PILL_INSET_Y, scale),
    )
}

pub(super) fn canonical_meeting_overlay_origin(
    current_origin: (i32, i32),
    scale: f64,
    presentation: MeetingOverlayPresentation,
) -> (i32, i32) {
    if !presentation.transcript_visible {
        let compact_offset = if presentation.compact {
            logical_pixels(
                (MEETING_PILL_SLOT_WIDTH - MEETING_COMPACT_PILL_SIZE) / 2.0,
                scale,
            )
        } else {
            0
        };
        return (
            current_origin.0 + logical_pixels(MEETING_PILL_GUTTER, scale) - compact_offset,
            current_origin.1 + logical_pixels(MEETING_PILL_GUTTER, scale),
        );
    }

    match presentation.placement {
        MeetingTranscriptPlacement::Above => (
            current_origin.0 + logical_pixels(MEETING_PILL_ABOVE_INSET_X, scale),
            current_origin.1
                + logical_pixels(
                    MEETING_PILL_GUTTER + MEETING_TRANSCRIPT_HEIGHT + MEETING_OVERLAY_GAP,
                    scale,
                ),
        ),
        MeetingTranscriptPlacement::Left => (
            current_origin.0
                + logical_pixels(
                    MEETING_PILL_GUTTER + MEETING_TRANSCRIPT_WIDTH + MEETING_OVERLAY_GAP,
                    scale,
                ),
            canonical_side_overlay_y(current_origin.1, scale, presentation.side_alignment),
        ),
        MeetingTranscriptPlacement::Right => (
            current_origin.0 + logical_pixels(MEETING_PILL_GUTTER, scale),
            canonical_side_overlay_y(current_origin.1, scale, presentation.side_alignment),
        ),
    }
}

fn canonical_side_overlay_y(
    current_y: i32,
    scale: f64,
    alignment: MeetingTranscriptSideAlignment,
) -> i32 {
    let inset = match alignment {
        MeetingTranscriptSideAlignment::Top => MEETING_PILL_GUTTER,
        MeetingTranscriptSideAlignment::Bottom => {
            MEETING_TRANSCRIPT_SIDE_HEIGHT - MEETING_PILL_GUTTER - MEETING_PILL_HEIGHT
        }
    };
    current_y + logical_pixels(inset, scale)
}

pub(super) fn meeting_overlay_geometry(
    canonical_origin: (i32, i32),
    scale: f64,
    compact: bool,
    transcript_visible: bool,
    monitor_position: (i32, i32),
    monitor_size: (u32, u32),
) -> MeetingOverlayGeometry {
    if !transcript_visible {
        return hidden_overlay_geometry(
            canonical_origin,
            scale,
            compact,
            monitor_position,
            monitor_size,
        );
    }

    let above_origin = (
        canonical_origin.0 - logical_pixels(MEETING_PILL_ABOVE_INSET_X, scale),
        canonical_origin.1
            - logical_pixels(
                MEETING_PILL_GUTTER + MEETING_TRANSCRIPT_HEIGHT + MEETING_OVERLAY_GAP,
                scale,
            ),
    );
    if above_origin.1 >= monitor_position.1 {
        return MeetingOverlayGeometry {
            placement: MeetingTranscriptPlacement::Above,
            side_alignment: MeetingTranscriptSideAlignment::Bottom,
            logical_size: (
                MEETING_TRANSCRIPT_ABOVE_WIDTH as i32,
                MEETING_TRANSCRIPT_ABOVE_HEIGHT as i32,
            ),
            origin: above_origin,
        };
    }

    side_overlay_geometry(canonical_origin, scale, monitor_position, monitor_size)
}

fn hidden_overlay_geometry(
    canonical_origin: (i32, i32),
    scale: f64,
    compact: bool,
    monitor_position: (i32, i32),
    monitor_size: (u32, u32),
) -> MeetingOverlayGeometry {
    let logical_size = if compact {
        let side = (MEETING_COMPACT_PILL_SIZE + MEETING_PILL_GUTTER * 2.0) as i32;
        (side, side)
    } else {
        (MEETING_OVERLAY_WIDTH as i32, MEETING_OVERLAY_HEIGHT as i32)
    };
    let centered_compact_offset = if compact {
        logical_pixels(
            (MEETING_PILL_SLOT_WIDTH - MEETING_COMPACT_PILL_SIZE) / 2.0,
            scale,
        )
    } else {
        0
    };
    let raw_origin = (
        canonical_origin.0 + centered_compact_offset - logical_pixels(MEETING_PILL_GUTTER, scale),
        canonical_origin.1 - logical_pixels(MEETING_PILL_GUTTER, scale),
    );
    let physical_size = (
        logical_pixels(f64::from(logical_size.0), scale) as u32,
        logical_pixels(f64::from(logical_size.1), scale) as u32,
    );

    MeetingOverlayGeometry {
        placement: MeetingTranscriptPlacement::Above,
        side_alignment: MeetingTranscriptSideAlignment::Bottom,
        logical_size,
        origin: clamp_overlay_coordinates(
            raw_origin.0,
            raw_origin.1,
            physical_size,
            monitor_position,
            monitor_size,
        ),
    }
}

fn side_overlay_geometry(
    canonical_origin: (i32, i32),
    scale: f64,
    monitor_position: (i32, i32),
    monitor_size: (u32, u32),
) -> MeetingOverlayGeometry {
    let anchor_x = canonical_origin.0 + logical_pixels(MEETING_PILL_SLOT_WIDTH / 2.0, scale);
    let anchor_bottom = canonical_origin.1 + logical_pixels(MEETING_PILL_HEIGHT, scale);
    let monitor_right = i64::from(monitor_position.0) + i64::from(monitor_size.0);
    let left_space = i64::from(anchor_x) - i64::from(monitor_position.0);
    let right_space = monitor_right - i64::from(anchor_x);
    let placement = if left_space >= right_space {
        MeetingTranscriptPlacement::Left
    } else {
        MeetingTranscriptPlacement::Right
    };
    let raw_x = match placement {
        MeetingTranscriptPlacement::Left => {
            canonical_origin.0
                - logical_pixels(
                    MEETING_PILL_GUTTER + MEETING_TRANSCRIPT_WIDTH + MEETING_OVERLAY_GAP,
                    scale,
                )
        }
        MeetingTranscriptPlacement::Right => {
            canonical_origin.0 - logical_pixels(MEETING_PILL_GUTTER, scale)
        }
        MeetingTranscriptPlacement::Above => unreachable!(),
    };
    let bottom_origin_y = anchor_bottom + logical_pixels(MEETING_PILL_GUTTER, scale)
        - logical_pixels(MEETING_TRANSCRIPT_SIDE_HEIGHT, scale);
    let top_origin_y = canonical_origin.1 - logical_pixels(MEETING_PILL_GUTTER, scale);
    let physical_height = logical_pixels(MEETING_TRANSCRIPT_SIDE_HEIGHT, scale);
    let monitor_bottom = i64::from(monitor_position.1) + i64::from(monitor_size.1);
    let side_alignment = choose_side_alignment(
        anchor_bottom,
        bottom_origin_y,
        top_origin_y,
        physical_height,
        monitor_position.1,
        monitor_bottom,
    );
    let raw_y = match side_alignment {
        MeetingTranscriptSideAlignment::Top => top_origin_y,
        MeetingTranscriptSideAlignment::Bottom => bottom_origin_y,
    };
    let physical_size = (
        logical_pixels(MEETING_TRANSCRIPT_SIDE_WIDTH, scale) as u32,
        logical_pixels(MEETING_TRANSCRIPT_SIDE_HEIGHT, scale) as u32,
    );

    MeetingOverlayGeometry {
        placement,
        side_alignment,
        logical_size: (
            MEETING_TRANSCRIPT_SIDE_WIDTH as i32,
            MEETING_TRANSCRIPT_SIDE_HEIGHT as i32,
        ),
        origin: clamp_overlay_coordinates(
            raw_x,
            raw_y,
            physical_size,
            monitor_position,
            monitor_size,
        ),
    }
}

fn choose_side_alignment(
    anchor_bottom: i32,
    bottom_origin_y: i32,
    top_origin_y: i32,
    physical_height: i32,
    monitor_top: i32,
    monitor_bottom: i64,
) -> MeetingTranscriptSideAlignment {
    if bottom_origin_y >= monitor_top {
        MeetingTranscriptSideAlignment::Bottom
    } else if i64::from(top_origin_y) + i64::from(physical_height) <= monitor_bottom {
        MeetingTranscriptSideAlignment::Top
    } else if i64::from(anchor_bottom) - i64::from(monitor_top)
        >= monitor_bottom - i64::from(anchor_bottom)
    {
        MeetingTranscriptSideAlignment::Bottom
    } else {
        MeetingTranscriptSideAlignment::Top
    }
}
