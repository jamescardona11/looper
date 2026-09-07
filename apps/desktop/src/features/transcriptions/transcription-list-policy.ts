import type { TranscriptionRecord } from "../../contracts";
import { matchesDateRange, type TranscriptionSort } from "./searchQuery";

export type TranscriptionListEntry =
  | { type: "header"; id: string; label: string }
  | { type: "item"; record: TranscriptionRecord };

/**
 * These are the history facets the local record actually persists.  Insertion
 * and clipboard state are deliberately absent: older records cannot prove
 * either fact, so exposing those filters would produce invented results.
 */
export type HistoryTranscriptionFilter =
  | "all"
  | "audio"
  | "cleaned"
  | "failed";

export type TranscriptionListViewState =
  | { kind: "empty" }
  | { kind: "no-results"; text: string }
  | { kind: "list"; loading: boolean };

const localDayStart = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function visibleTranscriptions(
  records: TranscriptionRecord[],
  filter: {
    todayOnly: boolean;
    text: string;
    after: Date | null;
    before: Date | null;
    sort: TranscriptionSort;
    now: Date;
  },
): TranscriptionRecord[] {
  const todayBoundary = localDayStart(filter.now).getTime();
  const searchText = filter.text.trim().toLowerCase();
  const accepted = records.filter((record) => {
    if (
      filter.todayOnly &&
      new Date(record.timestamp).getTime() < todayBoundary
    ) {
      return false;
    }
    if (
      searchText &&
      !record.text.toLowerCase().includes(searchText) &&
      !(record.raw_text ?? "").toLowerCase().includes(searchText)
    ) {
      return false;
    }
    return matchesDateRange(record.timestamp, filter.after, filter.before);
  });
  if (filter.sort === "recent") return accepted;

  const ordered = [...accepted];
  if (filter.sort === "oldest") {
    return ordered.sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    );
  }
  const direction = filter.sort === "longest" ? -1 : 1;
  return ordered.sort(
    (left, right) =>
      direction * ((left.word_count ?? 0) - (right.word_count ?? 0)),
  );
}

export function filterHistoryTranscriptions(
  records: TranscriptionRecord[],
  filter: HistoryTranscriptionFilter,
): TranscriptionRecord[] {
  if (filter === "audio") {
    return records.filter((record) => record.audio_available);
  }
  if (filter === "cleaned") {
    return records.filter((record) => record.llm_cleaned);
  }
  if (filter === "failed") {
    return records.filter((record) => record.status === "error");
  }
  return records;
}

export function transcriptionGroupLabel(
  date: Date,
  now: Date,
  labels: { today: string; yesterday: string },
): string {
  const currentDay = localDayStart(now);
  const targetDay = localDayStart(date);
  const dayDistance = Math.round(
    (currentDay.getTime() - targetDay.getTime()) / 86_400_000,
  );
  if (dayDistance === 0) return labels.today;
  if (dayDistance === 1) return labels.yesterday;
  if (dayDistance > 1 && dayDistance < 7) {
    return targetDay.toLocaleDateString([], { weekday: "long" });
  }
  if (targetDay.getFullYear() === currentDay.getFullYear()) {
    return targetDay.toLocaleDateString([], { month: "long", day: "numeric" });
  }
  return targetDay.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildTranscriptionListEntries(
  records: TranscriptionRecord[],
  options: {
    grouped: boolean;
    labelFor: (date: Date) => string;
  },
): TranscriptionListEntry[] {
  if (!options.grouped) {
    return records.map((record) => ({ type: "item", record }));
  }
  const entries: TranscriptionListEntry[] = [];
  let previousLabel: string | null = null;
  for (const record of records) {
    const label = options.labelFor(new Date(record.timestamp));
    if (label !== previousLabel) {
      entries.push({ type: "header", id: `h-${label}-${record.id}`, label });
      previousLabel = label;
    }
    entries.push({ type: "item", record });
  }
  return entries;
}

export function transcriptionListViewState(input: {
  fetched: boolean;
  loading: boolean;
  totalCount: number;
  visibleCount: number;
  query: string;
  resultText: string;
}): TranscriptionListViewState {
  const hasQuery = input.query.trim().length > 0;
  if (input.fetched && input.totalCount === 0 && !hasQuery) {
    return { kind: "empty" };
  }
  if (input.fetched && input.visibleCount === 0 && hasQuery) {
    return { kind: "no-results", text: input.resultText.trim() };
  }
  return { kind: "list", loading: input.loading && !input.fetched };
}

export const transcriptionEntryClassName = (
  fresh: boolean,
  poofing: boolean,
): string =>
  [
    "transcription-entry",
    fresh && "transcription-entry-fade",
    poofing && "looper-poof-out",
  ]
    .filter(Boolean)
    .join(" ");
