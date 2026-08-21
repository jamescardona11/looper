import { describe, expect, test } from "vitest";
import { groupMeetingTranscriptSegments } from "../meeting-transcript";

describe("meeting transcript groups", () => {
  test("sorts segments and joins adjacent entries from the same source", () => {
    expect(
      groupMeetingTranscriptSegments([
        { id: "3", source: "you", start_ms: 30, end_ms: 40, text: "Three" },
        { id: "1", source: "them", start_ms: 10, end_ms: 20, text: "One" },
        { id: "2", source: "them", start_ms: 20, end_ms: 30, text: " Two " },
      ]),
    ).toEqual([
      { id: "1", source: "them", text: "One Two", start_ms: 10, end_ms: 30 },
      { id: "3", source: "you", text: "Three", start_ms: 30, end_ms: 40 },
    ]);
  });

  test("reopens the speaker after a long pause so the label stays on screen", () => {
    const groups = groupMeetingTranscriptSegments([
      { id: "1", source: "you", start_ms: 0, end_ms: 2_000, text: "Antes" },
      { id: "2", source: "you", start_ms: 3_000, end_ms: 4_000, text: "Sigo" },
      {
        id: "3",
        source: "you",
        start_ms: 40_000,
        end_ms: 41_000,
        text: "Vuelvo",
      },
    ]);

    expect(groups.map((group) => group.text)).toEqual(["Antes Sigo", "Vuelvo"]);
  });

  test("ignores empty transcript segments", () => {
    expect(
      groupMeetingTranscriptSegments([
        { id: "1", source: "you", start_ms: 0, end_ms: 1, text: "  " },
      ]),
    ).toEqual([]);
  });
});
