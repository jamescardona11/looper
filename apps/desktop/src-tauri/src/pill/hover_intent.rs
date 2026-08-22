//! Turns a stream of "is the cursor on the pill?" samples into two separate
//! answers, because the pill's two reactions to the pointer want opposite
//! timing.
//!
//! Becoming interactive must be immediate: the overlay is a click-through
//! panel, and a pointer that arrives while it is still transparent loses its
//! click to whatever sits underneath.
//!
//! Expanding must not be. The pill lives over other apps, so a pointer merely
//! crossing it should leave it alone; only a pointer that arrives and settles
//! means to use it. Collapsing waits longer still, so a pixel of jitter or a
//! reach past the edge does not flicker the pill.

/// How long a settled pointer stays on the pill before it expands.
const ENTER_DELAY_MS: u64 = 140;
/// How long the pointer stays away before the pill collapses.
const EXIT_DELAY_MS: u64 = 320;
/// Travel between two samples above which the pointer is passing through
/// rather than arriving. At the 50ms poll this is roughly 800pt/s.
const PASSING_THROUGH_PX: f64 = 40.0;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Phase {
    Away,
    Arriving { since_ms: u64 },
    Over,
    Leaving { since_ms: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HoverDecision {
    /// Whether the overlay window should accept the pointer.
    pub interactive: bool,
    /// Whether the pill should present itself as hovered.
    pub hovering: bool,
}

pub struct HoverIntent {
    phase: Phase,
    last_cursor: Option<(f64, f64)>,
    enter_delay_ms: u64,
    exit_delay_ms: u64,
}

impl Default for HoverIntent {
    fn default() -> Self {
        Self::new(ENTER_DELAY_MS, EXIT_DELAY_MS)
    }
}

impl HoverIntent {
    pub fn new(enter_delay_ms: u64, exit_delay_ms: u64) -> Self {
        Self {
            phase: Phase::Away,
            last_cursor: None,
            enter_delay_ms,
            exit_delay_ms,
        }
    }

    pub fn decision(&self) -> HoverDecision {
        match self.phase {
            Phase::Away => HoverDecision {
                interactive: false,
                hovering: false,
            },
            Phase::Arriving { .. } => HoverDecision {
                interactive: true,
                hovering: false,
            },
            Phase::Over | Phase::Leaving { .. } => HoverDecision {
                interactive: true,
                hovering: true,
            },
        }
    }

    pub fn observe(&mut self, inside: bool, cursor: (f64, f64), now_ms: u64) -> HoverDecision {
        let travel = self
            .last_cursor
            .map(|last| (cursor.0 - last.0).hypot(cursor.1 - last.1));
        self.last_cursor = Some(cursor);

        self.phase = match (self.phase, inside) {
            (Phase::Away, true) => Phase::Arriving { since_ms: now_ms },
            (Phase::Away, false) => Phase::Away,

            // A pointer still crossing the pill keeps restarting its welcome.
            (Phase::Arriving { .. }, true)
                if travel.is_some_and(|travel| travel > PASSING_THROUGH_PX) =>
            {
                Phase::Arriving { since_ms: now_ms }
            }
            (Phase::Arriving { since_ms }, true) => {
                if now_ms.saturating_sub(since_ms) >= self.enter_delay_ms {
                    Phase::Over
                } else {
                    Phase::Arriving { since_ms }
                }
            }
            (Phase::Arriving { .. }, false) => Phase::Away,

            (Phase::Over, true) => Phase::Over,
            (Phase::Over, false) => Phase::Leaving { since_ms: now_ms },

            (Phase::Leaving { .. }, true) => Phase::Over,
            (Phase::Leaving { since_ms }, false) => {
                if now_ms.saturating_sub(since_ms) >= self.exit_delay_ms {
                    Phase::Away
                } else {
                    Phase::Leaving { since_ms }
                }
            }
        };

        self.decision()
    }

    /// Drops the pill immediately, with no grace period. Used when the cursor
    /// cannot be read: holding an interactive panel open on a stale answer
    /// leaves an invisible window eating the user's clicks.
    pub fn abandon(&mut self) -> HoverDecision {
        self.phase = Phase::Away;
        self.last_cursor = None;
        self.decision()
    }

    /// Forgets where the pointer was, without changing what the pill shows.
    /// A drag moves the window under a still pointer, so the travel measured
    /// across the gap says nothing about intent.
    pub fn forget_travel(&mut self) {
        self.last_cursor = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STILL: (f64, f64) = (10.0, 10.0);

    fn settled() -> HoverIntent {
        HoverIntent::new(140, 320)
    }

    #[test]
    fn a_pointer_that_arrives_and_settles_expands_the_pill() {
        let mut intent = settled();

        assert_eq!(
            intent.observe(true, STILL, 0),
            HoverDecision {
                interactive: true,
                hovering: false
            },
            "the window takes the pointer at once so no click is lost",
        );
        assert!(!intent.observe(true, STILL, 100).hovering);
        assert!(intent.observe(true, STILL, 140).hovering);
    }

    #[test]
    fn a_pointer_crossing_the_pill_never_expands_it() {
        let mut intent = settled();
        let mut x = 0.0;

        for sample in 0..12 {
            x += 60.0;
            assert!(
                !intent.observe(true, (x, 10.0), sample * 50).hovering,
                "a pointer travelling 60pt per sample is passing through",
            );
        }
    }

    #[test]
    fn the_pointer_only_has_to_settle_to_be_welcomed() {
        let mut intent = settled();

        intent.observe(true, (0.0, 10.0), 0);
        intent.observe(true, (200.0, 10.0), 50);
        assert!(!intent.observe(true, STILL, 100).hovering);

        // Stopped now: the delay runs from the moment it settled.
        assert!(!intent.observe(true, STILL, 200).hovering);
        assert!(intent.observe(true, STILL, 240).hovering);
    }

    #[test]
    fn leaving_for_an_instant_does_not_collapse_the_pill() {
        let mut intent = settled();
        intent.observe(true, STILL, 0);
        intent.observe(true, STILL, 140);
        assert!(intent.decision().hovering);

        assert!(intent.observe(false, STILL, 200).hovering);
        assert!(intent.observe(false, STILL, 400).hovering);
        assert!(intent.observe(true, STILL, 450).hovering, "came back");

        assert!(intent.observe(false, STILL, 500).hovering);
        assert!(!intent.observe(false, STILL, 820).hovering);
    }

    #[test]
    fn an_unreadable_cursor_drops_the_pill_at_once() {
        let mut intent = settled();
        intent.observe(true, STILL, 0);
        intent.observe(true, STILL, 140);

        assert_eq!(
            intent.abandon(),
            HoverDecision {
                interactive: false,
                hovering: false
            },
        );
    }

    #[test]
    fn a_drag_does_not_leave_the_pointer_looking_like_it_bolted() {
        let mut intent = settled();
        intent.observe(true, STILL, 0);
        intent.observe(true, STILL, 140);
        assert!(intent.decision().hovering);

        // The window travelled with the pointer; the next sample lands far
        // from the last one without the pointer having crossed anything.
        intent.forget_travel();
        assert!(intent.observe(true, (900.0, 600.0), 5_000).hovering);
    }
}
