import type { MeetingNoteSelection } from "../../../types";

function heldDurationMs(selection: MeetingNoteSelection, nowMs: number) {
  const startedAtMs = Date.parse(selection.started_at);
  return Number.isFinite(startedAtMs) ? Math.max(0, nowMs - startedAtMs) : 0;
}

export function selectedDurationMs(
  selection: MeetingNoteSelection,
  nowMs: number,
) {
  const heldMs = heldDurationMs(selection, nowMs);
  return Math.min(
    selection.max_duration_ms,
    selection.initial_duration_ms +
      Math.floor(heldMs / selection.hold_step_ms) * selection.duration_step_ms,
  );
}

export function nextDurationMilestone(
  selectedMs: number,
  durationStepMs: number,
  maxMs: number,
) {
  if (selectedMs >= maxMs) return maxMs;
  return Math.min(maxMs, selectedMs + durationStepMs);
}

export function remainingHoldStepMs(
  selection: MeetingNoteSelection,
  nowMs: number,
) {
  const heldMs = heldDurationMs(selection, nowMs);
  const elapsedInStep = heldMs % selection.hold_step_ms;
  return elapsedInStep === 0
    ? selection.hold_step_ms
    : selection.hold_step_ms - elapsedInStep;
}
