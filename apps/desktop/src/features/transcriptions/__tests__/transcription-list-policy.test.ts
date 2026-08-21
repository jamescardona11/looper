import { describe, expect, it } from "vitest";
import type { TranscriptionRecord } from "../../../contracts";
import {
  buildTranscriptionListEntries,
  transcriptionEntryClassName,
  transcriptionGroupLabel,
  transcriptionListViewState,
  visibleTranscriptions,
} from "../transcription-list-policy";

const row = (
  id: string,
  timestamp: string,
  text: string,
  words: number,
  rawText?: string,
): TranscriptionRecord => ({
  id,
  timestamp,
  text,
  raw_text: rawText,
  audio_path: "",
  audio_available: false,
  status: "success",
  llm_cleaned: false,
  speech_model: "parakeet",
  word_count: words,
  audio_duration_seconds: 0,
  synced: false,
});

const rows = [
  row("new", "2026-08-16T15:00:00", "Project update", 4),
  row("old", "2026-08-10T10:00:00", "Other", 10, "Project archive"),
  row("short", "2026-08-16T09:00:00", "Project note", 2),
];

describe("transcription list policy", () => {
  it("combines today, text, raw text, and date filters", () => {
    const visible = visibleTranscriptions(rows, {
      todayOnly: true,
      text: "project",
      after: null,
      before: null,
      sort: "recent",
      now: new Date("2026-08-16T18:00:00"),
    });
    expect(visible.map(({ id }) => id)).toEqual(["new", "short"]);
  });

  it("supports every sort while leaving recent source order intact", () => {
    const base = {
      todayOnly: false,
      text: "",
      after: null,
      before: null,
      now: new Date("2026-08-16T18:00:00"),
    };
    expect(
      visibleTranscriptions(rows, { ...base, sort: "recent" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["new", "old", "short"]);
    expect(
      visibleTranscriptions(rows, { ...base, sort: "oldest" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["old", "short", "new"]);
    expect(
      visibleTranscriptions(rows, { ...base, sort: "longest" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["old", "new", "short"]);
    expect(
      visibleTranscriptions(rows, { ...base, sort: "shortest" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["short", "new", "old"]);
  });

  it("groups adjacent days with stable header ids", () => {
    const entries = buildTranscriptionListEntries(rows, {
      grouped: true,
      labelFor: (date) => date.toISOString().slice(0, 10),
    });
    expect(entries.map((entry) => entry.type)).toEqual([
      "header",
      "item",
      "header",
      "item",
      "header",
      "item",
    ]);
    expect(entries[0]).toMatchObject({
      id: "h-2026-08-16-new",
      label: "2026-08-16",
    });
  });

  it("uses translated relative labels before calendar labels", () => {
    const now = new Date("2026-08-16T18:00:00");
    expect(
      transcriptionGroupLabel(new Date("2026-08-16T08:00:00"), now, {
        today: "HOY-X",
        yesterday: "AYER-X",
      }),
    ).toBe("HOY-X");
    expect(
      transcriptionGroupLabel(new Date("2026-08-15T08:00:00"), now, {
        today: "HOY-X",
        yesterday: "AYER-X",
      }),
    ).toBe("AYER-X");
  });

  it("distinguishes empty, no-results, loading, and list states", () => {
    expect(
      transcriptionListViewState({
        fetched: true,
        loading: false,
        totalCount: 0,
        visibleCount: 0,
        query: "",
        resultText: "",
      }),
    ).toEqual({ kind: "empty" });
    expect(
      transcriptionListViewState({
        fetched: true,
        loading: false,
        totalCount: 3,
        visibleCount: 0,
        query: "alpha",
        resultText: "alpha",
      }),
    ).toEqual({ kind: "no-results", text: "alpha" });
    expect(
      transcriptionListViewState({
        fetched: false,
        loading: true,
        totalCount: 0,
        visibleCount: 0,
        query: "",
        resultText: "",
      }),
    ).toEqual({ kind: "list", loading: true });
    expect(transcriptionEntryClassName(true, true)).toBe(
      "transcription-entry transcription-entry-fade looper-poof-out",
    );
  });
});
