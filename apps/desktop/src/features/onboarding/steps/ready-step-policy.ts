import type { PillInsertedPayload } from "../../../data/capture/overlay";

export const insertionEvidenceIsValid = (
  event: PillInsertedPayload,
  fieldValue: string,
) => event.chars > 0 && event.can_undo && fieldValue.trim().length > 0;

const SWITCH_TRACK_BASE =
  "relative h-6 w-10 shrink-0 rounded-full transition-colors";
const SWITCH_THUMB_BASE =
  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/10";

export const autoLaunchTrackClassName = (enabled: boolean) =>
  `${SWITCH_TRACK_BASE} ${enabled ? "bg-emerald-500" : "bg-surface-hover"}`;

export const autoLaunchThumbClassName = (enabled: boolean) =>
  `${SWITCH_THUMB_BASE} ${enabled ? "right-0.5" : "left-0.5"}`;
