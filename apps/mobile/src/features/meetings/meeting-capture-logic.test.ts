import { describe, expect, it } from "vitest";
import {
  addMarkedMoment,
  createMeetingIdentity,
  formatMeetingDuration,
} from "./meeting-capture-logic";

describe("meeting capture", () => {
  it("creates a stable mobile meeting identity from injected values", () => {
    expect(createMeetingIdentity(1_700_000_000_000, "a-b_c")).toMatchObject({
      meetingId: "meeting_1700000000000_abc",
    });
  });

  it("deduplicates accidental double marks while preserving later moments", () => {
    const first = addMarkedMoment([], 10_200);
    expect(addMarkedMoment(first, 10_800)).toBe(first);
    expect(addMarkedMoment(first, 12_000)).toEqual([10_200, 12_000]);
  });

  it("formats elapsed time with tabular minute and second fields", () => {
    expect(formatMeetingDuration(125_900)).toBe("2:05");
  });
});
