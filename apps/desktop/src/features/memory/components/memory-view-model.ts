import type { MemorySearchResult, MemorySource } from "../../../data/memory";
import { groupByDay } from "../../../shared/lib/groupByDay";

export const MEMORY_SOURCE_LABELS: Record<MemorySource, string> = {
  dictation: "Dictations",
  library: "Recordings",
  meeting: "Meetings",
};

const SOURCE_ORDER: MemorySource[] = ["meeting", "dictation", "library"];

export const MEMORY_SUGGESTIONS = [
  "What did we decide about pricing?",
  "Action items from meetings",
  "Last week",
] as const;

export const MEMORY_DATE_WINDOWS = [
  { label: "Any time", days: null },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export type MemoryResultGroup = {
  key: string;
  label: string;
  results: MemorySearchResult[];
};

export function groupMemoryResults(
  results: MemorySearchResult[],
  searching: boolean,
): MemoryResultGroup[] {
  if (searching) {
    return SOURCE_ORDER.map((source) => ({
      key: source,
      label: MEMORY_SOURCE_LABELS[source],
      results: results.filter((result) => result.source === source),
    })).filter((group) => group.results.length > 0);
  }

  return groupByDay(
    [...results].sort((a, b) => b.occurred_at_ms - a.occurred_at_ms),
    (result) => result.occurred_at_ms,
    { today: "Today", yesterday: "Yesterday" },
  ).map((group) => ({
    key: group.key,
    label: group.label,
    results: group.items,
  }));
}

export function indexMemoryResults(results: MemorySearchResult[]) {
  return new Map(
    results.map((result, index) => [`${result.source}:${result.id}`, index]),
  );
}

export function toggleMemorySource(
  selected: MemorySource[],
  source: MemorySource,
): MemorySource[] {
  return selected.includes(source)
    ? selected.filter((item) => item !== source)
    : [...selected, source];
}
