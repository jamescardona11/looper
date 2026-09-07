import { describe, expect, test } from "vitest";

import type { TranscriptionRecord } from "../../../contracts";
import { deriveWeeklyDictationActivity } from "../todayStats";

const record = (
  timestamp: string,
  words: number,
  status: TranscriptionRecord["status"] = "success",
): TranscriptionRecord => ({
  id: `${timestamp}-${words}`,
  timestamp,
  text: "Recorded text",
  audio_path: "audio.wav",
  speech_model: "local",
  audio_available: true,
  llm_cleaned: false,
  synced: false,
  word_count: words,
  audio_duration_seconds: 12,
  status,
});

describe("deriveWeeklyDictationActivity", () => {
  test("uses only successful records from the current Monday-to-Sunday week", () => {
    const activity = deriveWeeklyDictationActivity(
      [
        record("2026-08-24T10:00:00-05:00", 20),
        record("2026-08-26T10:00:00-05:00", 40),
        record("2026-08-26T11:00:00-05:00", 20),
        record("2026-08-25T10:00:00-05:00", 90, "error"),
        record("2026-08-23T10:00:00-05:00", 500),
      ],
      new Date("2026-08-25T12:00:00-05:00"),
    );

    expect(activity.words).toBe(80);
    expect(activity.days.map(({ words }) => words)).toEqual([
      20, 0, 60, 0, 0, 0, 0,
    ]);
    expect(activity.days.map(({ height }) => height)).toEqual([
      33, 0, 100, 0, 0, 0, 0,
    ]);
  });
});
