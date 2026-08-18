import { afterEach, describe, expect, test, vi } from "vitest";

import {
  currentTimePreset,
  formatDateToken,
  matchesDateRange,
  parseTranscriptionSearch,
  withSortToken,
  withTimePreset,
} from "./searchQuery";

afterEach(() => vi.useRealTimers());

describe("transcription search parsing", () => {
  test("separates free text, sorting, and an inclusive day", () => {
    const parsed = parseTranscriptionSearch(
      "project alpha sort:longest on:2026-08-16",
    );

    expect(parsed.text).toBe("project alpha");
    expect(parsed.sort).toBe("longest");
    expect(parsed.after).toEqual(new Date(2026, 7, 16));
    expect(parsed.before).toEqual(new Date(2026, 7, 17));
  });

  test("keeps malformed date filters as searchable text", () => {
    expect(parseTranscriptionSearch("after:2026-02-30 review")).toEqual({
      text: "after:2026-02-30 review",
      sort: "recent",
      after: null,
      before: null,
    });
  });

  test("normalizes unsupported sort values to recent", () => {
    expect(parseTranscriptionSearch("notes sort:fastest")).toMatchObject({
      text: "notes",
      sort: "recent",
    });
  });
});

describe("transcription search query updates", () => {
  test("replaces sort filters without duplicating them", () => {
    expect(withSortToken("alpha sort:oldest beta", "shortest")).toBe(
      "alpha beta sort:shortest",
    );
    expect(withSortToken("alpha sort:oldest", "recent")).toBe("alpha");
  });

  test("replaces time filters using the local calendar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T14:30:00"));

    expect(withTimePreset("alpha before:2020-01-01", "today")).toBe(
      "alpha on:2026-08-16",
    );
    expect(withTimePreset("alpha on:2020-01-01", "7d")).toBe(
      "alpha after:2026-08-10",
    );
    expect(withTimePreset("alpha after:2020-01-01", "any")).toBe("alpha");
  });
});

describe("transcription search date policy", () => {
  test("formats local date tokens with padded fields", () => {
    expect(formatDateToken(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  test("treats after as inclusive and before as exclusive", () => {
    const after = new Date("2026-08-16T00:00:00");
    const before = new Date("2026-08-17T00:00:00");

    expect(matchesDateRange("2026-08-16T00:00:00", after, before)).toBe(true);
    expect(matchesDateRange("2026-08-17T00:00:00", after, before)).toBe(false);
    expect(matchesDateRange("not-a-date", after, before)).toBe(false);
  });

  test("recognizes built-in time presets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T14:30:00"));

    expect(currentTimePreset(null, null)).toBe("any");
    expect(
      currentTimePreset(new Date(2026, 7, 16), new Date(2026, 7, 17)),
    ).toBe("today");
    expect(currentTimePreset(new Date(2026, 7, 10), null)).toBe("7d");
    expect(currentTimePreset(new Date(2026, 7, 9), null)).toBe("custom");
  });
});
