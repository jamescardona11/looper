import { SPEAKER_COLORS } from "./library-detail-metadata";
import type { LibraryItem, Speaker, TranscriptSegment } from "../../../types";
import type { VisibleTranscriptSegment } from "./library-transcript-panel-types";

const BUSY_STATES = new Set([
  "transcribing",
  "cancelling",
  "pending",
  "recording",
  "importing",
]);

export function hasUsableTranscript(item: LibraryItem) {
  return (
    item.status.type === "complete" && Boolean(item.transcript?.trim().length)
  );
}

export function isLibraryItemBusy(item: LibraryItem) {
  return BUSY_STATES.has(item.status.type);
}

// Reuniones y notas se graban desde la app y comparten superficie de revisión:
// documento, resumen, momentos y chat. Un import no, porque no hay captura
// detrás de la que hablar.
export function isCaptureItem(item: LibraryItem) {
  return item.kind === "meeting" || item.kind === "recording";
}

export function speakersWithPalette(item: LibraryItem): Speaker[] {
  return (item.speakers ?? []).map((speaker, position) => ({
    ...speaker,
    color: speaker.color ?? SPEAKER_COLORS[position % SPEAKER_COLORS.length],
  }));
}

export function speakerColorAt(position: number) {
  return SPEAKER_COLORS[position % SPEAKER_COLORS.length];
}

export function availableTagChoices(
  assigned: string[],
  catalog: string[],
  input: string,
) {
  const assignedKeys = new Set(assigned.map((tag) => tag.toLowerCase()));
  const query = input.trim().toLowerCase();
  return catalog.filter((tag) => {
    const key = tag.toLowerCase();
    return !assignedKeys.has(key) && (!query || key.includes(query));
  });
}

export function visibleTranscriptSegments(
  segments: TranscriptSegment[] | null | undefined,
  speakerId: string | null,
): VisibleTranscriptSegment[] {
  const indexed = (segments ?? []).map((segment, index) => ({
    segment,
    index,
  }));
  return speakerId
    ? indexed.filter(({ segment }) => segment.speaker_id === speakerId)
    : indexed;
}

export function speakerIndex(speakers: Speaker[]) {
  return new Map(speakers.map((speaker) => [speaker.id, speaker]));
}

export function activeSegmentAt(
  seconds: number,
  segments: TranscriptSegment[] | null | undefined,
) {
  const target = Math.max(0, Math.round(seconds * 1000));
  let active = -1;
  for (const [index, segment] of (segments ?? []).entries()) {
    if (segment.start_ms > target) break;
    active = index;
  }
  return active;
}

const compactText = (text: string) => text.toLowerCase().replace(/\s+/g, "");

export function alignWordsToSegments(
  segments: TranscriptSegment[] | null | undefined,
  words: TranscriptSegment[] | null | undefined,
) {
  if (!segments?.length || !words?.length) return null;
  const starts: Array<number | null> = [];
  let cursor = 0;
  for (const segment of segments) {
    const tokens = segment.text.trim().split(/\s+/).filter(Boolean);
    const target = compactText(segment.text);
    let start: number | null = null;
    for (let lookahead = 0; lookahead < 24 && tokens.length; lookahead += 1) {
      const candidate = cursor + lookahead;
      if (candidate + tokens.length > words.length) break;
      const joined = words
        .slice(candidate, candidate + tokens.length)
        .map((word) => word.text)
        .join("");
      if (compactText(joined) !== target) continue;
      start = candidate;
      cursor = candidate + tokens.length;
      break;
    }
    starts.push(start);
  }
  return starts;
}

export function activeWordAt({
  seconds,
  activeSegment,
  segments,
  words,
  wordStarts,
}: {
  seconds: number;
  activeSegment: number;
  segments: TranscriptSegment[] | null | undefined;
  words: TranscriptSegment[] | null | undefined;
  wordStarts: Array<number | null> | null;
}) {
  if (activeSegment < 0 || !words?.length) return -1;
  const firstWord = wordStarts?.[activeSegment];
  const segment = segments?.[activeSegment];
  if (firstWord == null || !segment) return -1;
  const wordCount = segment.text.trim().split(/\s+/).filter(Boolean).length;
  const target = Math.max(0, Math.round(seconds * 1000));
  let active = -1;
  const boundary = Math.min(firstWord + wordCount, words.length);
  for (let index = firstWord; index < boundary; index += 1) {
    if (words[index].start_ms <= target) active = index;
  }
  return active;
}

export function matchingIndexes<T>(
  entries: T[],
  query: string,
  textFor: (entry: T) => string,
) {
  if (!query) return [];
  const needle = query.toLowerCase();
  const indexes: number[] = [];
  entries.forEach((entry, index) => {
    if (textFor(entry).toLowerCase().includes(needle)) indexes.push(index);
  });
  return indexes;
}

export function occurrenceCount(text: string, query: string) {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let count = 0;
  for (let cursor = haystack.indexOf(needle); cursor !== -1;) {
    count += 1;
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }
  return count;
}

export function indexedMatchLabel(matches: number[], activeIndex: number) {
  const position = matches.length
    ? Math.min(activeIndex, matches.length - 1) + 1
    : 0;
  return `${position}/${matches.length}`;
}

export function selectedMatch(matches: number[], activeIndex: number) {
  return matches.length
    ? matches[Math.min(activeIndex, matches.length - 1)]
    : -1;
}

export function nextMatchIndex(
  current: number,
  direction: number,
  size: number,
) {
  return size ? (current + direction + size) % size : current;
}

export function timestampNeighbor(
  entries: VisibleTranscriptSegment[],
  activeSegment: number,
  direction: number,
) {
  const position = entries.findIndex(({ index }) => index === activeSegment);
  if (position < 0) return direction > 0 ? 0 : entries.length - 1;
  return Math.max(0, Math.min(entries.length - 1, position + direction));
}
