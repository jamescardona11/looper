import { describe, expect, test } from "vitest";

import {
  activeSegmentAt,
  activeWordAt,
  alignWordsToSegments,
  availableTagChoices,
  matchingIndexes,
  occurrenceCount,
  timestampNeighbor,
  visibleTranscriptSegments,
} from "../library-detail-policy";
import {
  initialDetailState,
  synchronizeDetailState,
} from "../library-detail-state";
import type { LibraryItem, TranscriptSegment } from "../../../../types";

const segments: TranscriptSegment[] = [
  { start_ms: 0, end_ms: 900, text: "Hello world", speaker_id: "speaker-a" },
  {
    start_ms: 1_000,
    end_ms: 1_900,
    text: "Next thought",
    speaker_id: "speaker-b",
  },
];
const words: TranscriptSegment[] = [
  { start_ms: 0, end_ms: 300, text: "Hello" },
  { start_ms: 350, end_ms: 700, text: "world" },
  { start_ms: 1_000, end_ms: 1_300, text: "Next" },
  { start_ms: 1_350, end_ms: 1_700, text: "thought" },
];

function item(patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "library-one",
    name: "Original",
    status: { type: "complete" },
    created_at: "2026-08-16T12:00:00.000Z",
    tags: ["alpha"],
    kind: "import",
    audio_path: "/tmp/audio.wav",
    source_path: "/tmp/source.wav",
    store_original: true,
    duration_seconds: 10,
    file_size_bytes: 100,
    original_format: "wav",
    llm_cleanup_enabled: true,
    denoise_enabled: true,
    transcript: "Existing text",
    segments,
    words,
    speech_model: "parakeet",
    show_timestamps: true,
    detect_speakers: true,
    speakers: [],
    ...patch,
  };
}

describe("library detail policies", () => {
  test("reconciles external data without overwriting an active name edit", () => {
    const initial = initialDetailState(item());
    const idle = synchronizeDetailState(initial, item({ name: "Server name" }));
    expect(idle.nameDraft).toBe("Server name");

    const editing = { ...idle, isEditingName: true, nameDraft: "Local draft" };
    const updated = synchronizeDetailState(
      editing,
      item({ name: "New server name", transcript: "Server transcript" }),
    );
    expect(updated.nameDraft).toBe("Local draft");
    expect(updated.transcriptDraft).toBe("Server transcript");
  });

  test("accumulates streaming additions and resets them at terminal state", () => {
    const initial = initialDetailState(
      item({
        status: { type: "transcribing", progress: 0.2 },
        transcript: "A",
      }),
    );
    const appended = synchronizeDetailState(
      initial,
      item({
        status: { type: "transcribing", progress: 0.4 },
        transcript: "A\nB",
      }),
    );
    expect(appended.streamChunks).toEqual(["B"]);

    const replacement = synchronizeDetailState(
      appended,
      item({
        status: { type: "transcribing", progress: 0.7 },
        transcript: "Replacement",
      }),
    );
    expect(replacement.streamChunks).toEqual(["Replacement"]);
    expect(
      synchronizeDetailState(
        replacement,
        item({ transcript: "Replacement", status: { type: "complete" } }),
      ).streamChunks,
    ).toEqual([]);
  });

  test("aligns active words and filtered timestamp navigation", () => {
    const starts = alignWordsToSegments(segments, words);
    expect(starts).toEqual([0, 2]);
    expect(activeSegmentAt(1.4, segments)).toBe(1);
    expect(
      activeWordAt({
        seconds: 1.4,
        activeSegment: 1,
        segments,
        words,
        wordStarts: starts,
      }),
    ).toBe(3);

    const visible = visibleTranscriptSegments(segments, "speaker-b");
    expect(visible.map(({ index }) => index)).toEqual([1]);
    expect(timestampNeighbor(visible, 0, 1)).toBe(0);
  });

  test("normalizes tag and search policies without mutating source arrays", () => {
    const catalog = ["Alpha", "Beta", "Gamma"];
    expect(availableTagChoices(["alpha"], catalog, "  A ")).toEqual([
      "Beta",
      "Gamma",
    ]);
    expect(
      matchingIndexes(["One hit", "none", "HIT two"], "hit", String),
    ).toEqual([0, 2]);
    expect(occurrenceCount("echo ECHO other", "echo")).toBe(2);
    expect(catalog).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});
