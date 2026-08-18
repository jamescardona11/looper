import { describe, expect, test } from "vitest";

import type { TranscriptionRecord } from "../../types";
import { mergeTranscription } from "./QueryCacheBridge";

const record = (id: string, timestamp: string): TranscriptionRecord =>
  ({ id, timestamp }) as TranscriptionRecord;

describe("mergeTranscription", () => {
  test("replaces a completed transcription without reordering the list", () => {
    const current = [
      record("new", "2026-08-16T10:00:00Z"),
      record("old", "2026-08-16T08:00:00Z"),
    ];
    const replacement = record("old", "2026-08-16T08:30:00Z");

    expect(mergeTranscription(current, replacement)).toEqual([
      current[0],
      replacement,
    ]);
  });

  test("inserts new records in descending timestamp order", () => {
    const newest = record("newest", "2026-08-16T10:00:00Z");
    const oldest = record("oldest", "2026-08-16T08:00:00Z");
    const middle = record("middle", "2026-08-16T09:00:00Z");

    expect(mergeTranscription([newest, oldest], middle)).toEqual([
      newest,
      middle,
      oldest,
    ]);
  });
});
