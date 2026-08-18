import type {
  MeetingTranscriptSegment,
  MeetingTranscriptSource,
} from "../../../types";

type MeetingTranscriptGroup = {
  id: string;
  source: MeetingTranscriptSource;
  text: string;
};

export function groupMeetingTranscriptSegments(
  segments: MeetingTranscriptSegment[],
): MeetingTranscriptGroup[] {
  const groups: MeetingTranscriptGroup[] = [];

  for (const segment of [...segments].sort(
    (left, right) => left.start_ms - right.start_ms,
  )) {
    const text = segment.text.trim();
    if (!text) continue;
    const previous = groups.at(-1);
    if (previous?.source === segment.source) {
      previous.text = `${previous.text} ${text}`;
      continue;
    }
    groups.push({ id: segment.id, source: segment.source, text });
  }

  return groups;
}
