import {
  parseLocalDateToken,
  shiftLocalDay,
  startOfLocalDay,
  tokenForTimePreset,
  type TimePreset,
} from "./transcription-search-time";

export type TranscriptionSort = "recent" | "oldest" | "longest" | "shortest";

export type ParsedTranscriptionSearch = {
  text: string;
  sort: TranscriptionSort;
  /** Inclusive local start-of-day. */
  after: Date | null;
  /** Exclusive local start-of-day. */
  before: Date | null;
};

type MutableSearch = Omit<ParsedTranscriptionSearch, "text"> & {
  textTokens: string[];
};

const SUPPORTED_SORTS = new Set<TranscriptionSort>([
  "oldest",
  "longest",
  "shortest",
]);

function normalizedSort(value: string): TranscriptionSort {
  const candidate = value.toLowerCase() as TranscriptionSort;
  return SUPPORTED_SORTS.has(candidate) ? candidate : "recent";
}

function applyDateFilter(
  key: string,
  value: string,
  search: MutableSearch,
) {
  const date = parseLocalDateToken(value);
  if (date === null) return false;

  if (key === "after") search.after = startOfLocalDay(date);
  if (key === "before") search.before = startOfLocalDay(date);
  if (key === "on") {
    search.after = startOfLocalDay(date);
    search.before = shiftLocalDay(date, 1);
  }
  return key === "after" || key === "before" || key === "on";
}

function applyFilterToken(token: string, search: MutableSearch) {
  const separator = token.indexOf(":");
  if (separator <= 0) return false;

  const key = token.slice(0, separator).toLowerCase();
  const value = token.slice(separator + 1);
  if (key === "sort") {
    search.sort = normalizedSort(value);
    return true;
  }
  return applyDateFilter(key, value, search);
}

export function parseTranscriptionSearch(
  query: string,
): ParsedTranscriptionSearch {
  const search: MutableSearch = {
    textTokens: [],
    sort: "recent",
    after: null,
    before: null,
  };

  for (const token of query.split(/\s+/).filter(Boolean)) {
    if (!applyFilterToken(token, search)) search.textTokens.push(token);
  }

  return {
    text: search.textTokens.join(" "),
    sort: search.sort,
    after: search.after,
    before: search.before,
  };
}

function replaceQueryTokens(
  query: string,
  rejected: RegExp,
  appended: string | null,
) {
  const tokens = query
    .split(/\s+/)
    .filter((token) => token.length > 0 && !rejected.test(token));
  if (appended !== null) tokens.push(appended);
  return tokens.join(" ");
}

export function withSortToken(query: string, sort: TranscriptionSort) {
  const token = sort === "recent" ? null : `sort:${sort}`;
  return replaceQueryTokens(query, /^sort:/i, token);
}

export function withTimePreset(query: string, preset: TimePreset) {
  return replaceQueryTokens(
    query,
    /^(?:after|before|on):/i,
    tokenForTimePreset(preset),
  );
}
