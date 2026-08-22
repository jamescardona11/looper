import { describe, expect, test } from "vitest";
import {
  meetingCaptureBlocksStart,
  meetingCaptureIsVisible,
} from "../meeting-capture-visibility";

describe("meeting capture visibility", () => {
  test.each([
    ["idle", false],
    ["starting", false],
    ["recording", true],
    ["finalizing", true],
    ["error", false],
  ] as const)("keeps %s visibility truthful", (phase, expected) => {
    expect(meetingCaptureIsVisible(phase)).toBe(expected);
  });

  test.each([
    ["idle", false],
    ["starting", true],
    ["recording", true],
    ["finalizing", true],
    ["error", false],
  ] as const)("blocks a second recording while %s", (phase, expected) => {
    expect(meetingCaptureBlocksStart(phase)).toBe(expected);
  });
});
