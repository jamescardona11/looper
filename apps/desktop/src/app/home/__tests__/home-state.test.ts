import { describe, expect, test } from "vitest";

import type { MemorySearchResult } from "../../../data/memory";
import { createHomeState, reduceHomeState } from "../home-state";

function memoryResult(
  openTarget: MemorySearchResult["open_target"],
): MemorySearchResult {
  return {
    excerpt: "A useful excerpt",
    final_text: "A useful excerpt",
    id: `${openTarget}-42`,
    occurred_at: "2026-08-17T12:00:00Z",
    occurred_at_ms: 1_787_138_400_000,
    open_target: openTarget,
    score: 0.9,
    source: openTarget === "history" ? "dictation" : "meeting",
    title: openTarget === "history" ? "Dictation" : "Design review",
  };
}

describe("home state transitions", () => {
  test("keeps the active workspace route when license state changes", () => {
    const importing = {
      ...createHomeState(true),
      activeView: "library" as const,
      dragActive: true,
      pendingImportPaths: ["meeting.m4a"],
      supportMenuOpen: true,
    };

    const restricted = reduceHomeState(importing, {
      type: "license-changed",
      licensed: false,
    });

    expect(restricted).toMatchObject({
      activeView: "library",
      dragActive: true,
      licensed: false,
      pendingImportPaths: ["meeting.m4a"],
      supportMenuOpen: true,
    });
  });

  test("deduplicates dropped files and opens the import queue", () => {
    const next = reduceHomeState(createHomeState(true), {
      type: "open-import",
      paths: ["one.wav", "one.wav", "two.mp4"],
    });

    expect(next.activeView).toBe("import");
    expect(next.pendingImportPaths).toEqual(["one.wav", "two.mp4"]);
  });

  test("routes memory results to their original destination", () => {
    const initial = createHomeState(true);
    const history = reduceHomeState(initial, {
      type: "open-memory-result",
      result: memoryResult("history"),
    });
    const library = reduceHomeState(initial, {
      type: "open-memory-result",
      result: memoryResult("library"),
    });

    expect(history).toMatchObject({
      activeView: "history",
      historyFocusId: "history-42",
    });
    expect(library).toMatchObject({
      activeView: "library",
      libraryFocus: { id: "library-42", query: "Design review" },
    });
  });

  test("opens Memory even when no license is active", () => {
    const restricted = reduceHomeState(createHomeState(false), {
      type: "ask-memory",
      query: "quarterly plan",
    });

    expect(restricted.activeView).toBe("memory");
    expect(restricted.memoryPrefill).toBe("quarterly plan");
  });

  test("native history navigation clears transient imports and returns home", () => {
    const state = {
      ...createHomeState(true),
      activeView: "feature-lab" as const,
      dragActive: true,
      pendingImportPaths: ["recording.wav"],
    };

    expect(reduceHomeState(state, { type: "return-home" })).toMatchObject({
      activeView: "home",
      dragActive: false,
      pendingImportPaths: null,
    });
  });

  test("routes every settings entry into the primary workspace view", () => {
    const next = reduceHomeState(createHomeState(true), {
      type: "open-settings",
      tab: "about",
    });

    expect(next).toMatchObject({
      activeView: "settings",
      settingsTab: "about",
    });
  });
});
