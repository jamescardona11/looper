import type { Replacement, UserSnippet } from "../../../types";

export const DICTIONARY_ENTRY_LIMIT = 200;

const normalized = (value: string) => value.trim();

export function readableDictionaryError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sectionIsVisible(
  section: "all" | "vocabulary" | "rules" | "snippets",
  requested: "vocabulary" | "rules" | "snippets",
): boolean {
  return section === "all" || section === requested;
}

export function filterDictionaryEntries(
  entries: string[],
  searchQuery: string,
  embedded: boolean,
): string[] {
  const matches = searchQuery
    ? entries.filter((entry) => entry.toLowerCase().includes(searchQuery))
    : entries;
  if (embedded) return matches;
  return [...matches].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function dictionaryEntryLetter(entry: string): string {
  const first = entry.trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(first) ? first : "#";
}

export function addDictionaryEntry(
  current: string[],
  candidate: string,
): string[] | null {
  const value = normalized(candidate);
  if (
    !value ||
    current.length >= DICTIONARY_ENTRY_LIMIT ||
    current.includes(value)
  ) {
    return null;
  }
  return [value, ...current];
}

export function editDictionaryEntry(
  current: string[],
  index: number,
  candidate: string,
): string[] {
  const value = normalized(candidate);
  return value
    ? current.map((entry, position) => (position === index ? value : entry))
    : removeDictionaryItem(current, index);
}

export function removeDictionaryItem<T>(current: T[], index: number): T[] {
  return current.filter((_, position) => position !== index);
}

export function addDictionaryReplacement(
  current: Replacement[],
  fromCandidate: string,
  toCandidate: string,
): Replacement[] | null {
  const from = normalized(fromCandidate);
  const to = normalized(toCandidate);
  if (
    !from ||
    current.some((item) => item.from.toLowerCase() === from.toLowerCase())
  ) {
    return null;
  }
  return [{ from, to }, ...current];
}

export function editDictionaryReplacement(
  current: Replacement[],
  index: number,
  fromCandidate: string,
  toCandidate: string,
): Replacement[] {
  const from = normalized(fromCandidate);
  const to = normalized(toCandidate);
  if (!from) return removeDictionaryItem(current, index);
  return current.map((item, position) =>
    position === index ? { from, to } : item,
  );
}

export function addDictionarySnippet(
  current: UserSnippet[],
  triggerCandidate: string,
  expansionCandidate: string,
): UserSnippet[] | null {
  const trigger = normalized(triggerCandidate);
  const expansion = normalized(expansionCandidate);
  if (
    !trigger ||
    !expansion ||
    current.some((item) => item.trigger.toLowerCase() === trigger.toLowerCase())
  ) {
    return null;
  }
  return [{ trigger, expansion }, ...current];
}

export function editDictionarySnippet(
  current: UserSnippet[],
  index: number,
  triggerCandidate: string,
  expansionCandidate: string,
): UserSnippet[] {
  const trigger = normalized(triggerCandidate);
  const expansion = normalized(expansionCandidate);
  if (!trigger || !expansion) return removeDictionaryItem(current, index);
  return current.map((item, position) =>
    position === index ? { trigger, expansion } : item,
  );
}
