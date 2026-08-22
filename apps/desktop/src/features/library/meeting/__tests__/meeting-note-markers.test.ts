import { describe, expect, it } from "vitest";
import type {
  MeetingNoteMarker,
  TranscriptSegment,
} from "../../../../contracts";
import {
  meetingNoteRangeLabel,
  meetingNoteTranscript,
} from "../meeting-note-markers";

const marker: MeetingNoteMarker = {
  id: "note-1",
  captured_at_ms: 45_000,
  start_ms: 15_000,
  end_ms: 45_000,
  created_at: "2026-07-18T10:00:45Z",
};

const segments: TranscriptSegment[] = [
  { start_ms: 0, end_ms: 14_999, text: "Before" },
  { start_ms: 15_000, end_ms: 28_000, text: "Decision one." },
  { start_ms: 28_001, end_ms: 45_000, text: "Decision two." },
  { start_ms: 45_001, end_ms: 60_000, text: "After" },
];

describe("captured meeting notes", () => {
  it("builds the note from transcript segments inside its audio range", () => {
    expect(meetingNoteTranscript(marker, segments)).toBe(
      "Decision one. Decision two.",
    );
  });

  it("shows the retrospective audio range", () => {
    expect(meetingNoteRangeLabel(marker)).toBe("0:15–0:45");
  });

  it("falls back to the persisted live transcript when final segments omit the moment", () => {
    expect(
      meetingNoteTranscript(
        marker,
        [],
        [
          {
            start_ms: 20_000,
            end_ms: 30_000,
            text: "Captured while the meeting was live.",
          },
        ],
      ),
    ).toBe("Captured while the meeting was live.");
  });
});
