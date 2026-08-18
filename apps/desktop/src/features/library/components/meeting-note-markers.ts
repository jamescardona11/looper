import type { MeetingNoteMarker, TranscriptSegment } from "../../../types";
import { formatTimestamp } from "./format-timestamp";

type TimedTranscriptSegment = Pick<
  TranscriptSegment,
  "start_ms" | "end_ms" | "text"
>;

export function meetingNoteTranscript(
  marker: MeetingNoteMarker,
  segments: TimedTranscriptSegment[] | null | undefined,
  fallbackSegments?: TimedTranscriptSegment[] | null,
): string {
  const transcript = transcriptInsideMarker(marker, segments);
  return transcript || transcriptInsideMarker(marker, fallbackSegments);
}

function transcriptInsideMarker(
  marker: MeetingNoteMarker,
  segments: TimedTranscriptSegment[] | null | undefined,
): string {
  if (!segments) return "";
  const text: string[] = [];
  for (const segment of segments) {
    const overlapsMarker =
      segment.start_ms <= marker.end_ms && segment.end_ms >= marker.start_ms;
    const trimmed = segment.text.trim();
    if (overlapsMarker && trimmed) text.push(trimmed);
  }
  return text.join(" ");
}

export function meetingNoteRangeLabel(marker: MeetingNoteMarker): string {
  return `${formatTimestamp(marker.start_ms)}–${formatTimestamp(marker.end_ms)}`;
}
