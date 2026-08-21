import { describe, expect, test } from "vitest";

import type { MemorySearchResult } from "../../../../data/memory";
import {
  groupMemoryResults,
  indexMemoryResults,
  toggleMemorySource,
} from "../memory-view-model";

const result = (
  id: string,
  source: MemorySearchResult["source"],
): MemorySearchResult => ({
  id,
  source,
  title: id,
  occurred_at: "2026-08-17T12:00:00Z",
  occurred_at_ms: Date.parse("2026-08-17T12:00:00Z"),
  excerpt: id,
  final_text: id,
  score: 1,
  open_target: source === "dictation" ? "history" : "library",
});

describe("memory view model", () => {
  test("groups searched results by source priority and indexes the rendered order", () => {
    const results = [
      result("library-1", "library"),
      result("dictation-1", "dictation"),
      result("meeting-1", "meeting"),
    ];
    const groups = groupMemoryResults(results, true);
    const ordered = groups.flatMap((group) => group.results);

    expect(groups.map((group) => group.label)).toEqual([
      "Meetings",
      "Dictations",
      "Recordings",
    ]);
    expect(ordered.map(({ id }) => id)).toEqual([
      "meeting-1",
      "dictation-1",
      "library-1",
    ]);
    expect(indexMemoryResults(ordered).get("library:library-1")).toBe(2);
  });

  test("adds and removes a source without mutating the selection", () => {
    const selected = ["meeting"] as const;
    expect(toggleMemorySource([...selected], "library")).toEqual([
      "meeting",
      "library",
    ]);
    expect(toggleMemorySource([...selected], "meeting")).toEqual([]);
    expect(selected).toEqual(["meeting"]);
  });
});
