import type { Speaker, TranscriptSegment } from "../../../contracts";

export type TranscriptSpeakerVariant = "dot" | "label";

export function selectedTranscriptSpeaker(
  segment: TranscriptSegment,
  speakerById: Map<string, Speaker>,
) {
  return segment.speaker_id
    ? (speakerById.get(segment.speaker_id) ?? null)
    : null;
}

export function transcriptSpeakerTriggerClass(
  variant: TranscriptSpeakerVariant,
  assigned: boolean,
  menuOpen: boolean,
) {
  const layout =
    variant === "label"
      ? "relative inline-flex items-baseline rounded-md font-semibold outline-none transition-opacity after:absolute after:-inset-x-1 after:-inset-y-2 after:rounded-lg hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      : "flex items-center justify-center p-1 -m-1 transition-opacity hover:opacity-80";
  const unassignedTone =
    variant === "label"
      ? "text-content-muted"
      : menuOpen
        ? "opacity-100"
        : "opacity-0 group-hover/seg:opacity-60 focus:opacity-60";

  return [layout, assigned ? "" : unassignedTone].join(" ");
}

export function transcriptSpeakerDotClass(assigned: boolean) {
  const emptyDot = assigned ? "" : "border border-[var(--color-text-muted)]";
  return ["inline-block h-2 w-2 rounded-full shrink-0", emptyDot].join(" ");
}
