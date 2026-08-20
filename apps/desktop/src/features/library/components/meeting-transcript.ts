import type {
  MeetingTranscriptSegment,
  MeetingTranscriptSource,
} from "../../../types";

type MeetingTranscriptGroup = {
  id: string;
  source: MeetingTranscriptSource;
  text: string;
  start_ms: number;
  end_ms: number;
};

/**
 * Un monólogo largo se unía en un solo bloque, así que su etiqueta de quién
 * habla quedaba fuera de pantalla y el panel dejaba de decirlo. Una pausa
 * marcada abre bloque nuevo: la atribución vuelve a aparecer y el texto se lee
 * por párrafos en vez de como un muro.
 */
const SPEAKER_BREAK_MS = 12_000;

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
    const continues =
      previous?.source === segment.source &&
      segment.start_ms - previous.end_ms < SPEAKER_BREAK_MS;
    if (continues) {
      previous.text = `${previous.text} ${text}`;
      previous.end_ms = Math.max(previous.end_ms, segment.end_ms);
      continue;
    }
    groups.push({
      id: segment.id,
      source: segment.source,
      text,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
    });
  }

  return groups;
}
