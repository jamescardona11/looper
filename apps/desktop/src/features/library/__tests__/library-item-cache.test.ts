import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../../contracts";
import {
  applyImportProgress,
  applyTranscriptionProgress,
} from "../library-item-cache";

function item(patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "item-1",
    name: "Recording",
    status: { type: "pending" },
    created_at: "2026-08-17T00:00:00Z",
    tags: [],
    kind: "import",
    audio_path: "/tmp/audio.wav",
    source_path: "/tmp/source.wav",
    store_original: true,
    duration_seconds: 1,
    file_size_bytes: 10,
    original_format: "wav",
    llm_cleanup_enabled: false,
    denoise_enabled: false,
    speech_model: "parakeet",
    show_timestamps: false,
    detect_speakers: false,
    ...patch,
  };
}

describe("library item cache policy", () => {
  it("appends chunk text and segments while preserving previous results", () => {
    const updated = applyTranscriptionProgress(
      item({
        transcript: "First",
        segments: [{ start_ms: 0, end_ms: 100, text: "First" }],
      }),
      {
        id: "item-1",
        progress: 0.5,
        current_chunk: 2,
        total_chunks: 4,
        chunk_text: "second",
        chunk_segments: [{ start_ms: 101, end_ms: 200, text: "second" }],
      },
    );

    expect(updated.transcript).toBe("First second");
    expect(updated.segments?.map(({ text }) => text)).toEqual([
      "First",
      "second",
    ]);
    expect(updated.status).toEqual({ type: "transcribing", progress: 0.5 });
  });

  it("resets streaming content and ignores progress after terminal states", () => {
    const reset = applyTranscriptionProgress(
      item({
        transcript: "stale",
        segments: [],
        status: { type: "importing", progress: 0.2 },
      }),
      {
        id: "item-1",
        progress: 0,
        current_chunk: 0,
        total_chunks: 0,
      },
    );
    expect(reset.transcript).toBe("");
    expect(reset.segments).toEqual([]);

    const complete = item({ status: { type: "complete" } });
    expect(
      applyTranscriptionProgress(complete, {
        id: "item-1",
        progress: 0.8,
        current_chunk: 3,
        total_chunks: 4,
        chunk_text: "ignored",
      }),
    ).toBe(complete);
    expect(applyImportProgress(complete, { id: "item-1", progress: 0.3 })).toBe(
      complete,
    );
  });
});
