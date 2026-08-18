import { describe, expect, test } from "vitest";
import {
  signalStageFromPillState,
  shouldShowInsertedStage,
  shouldShowWritingStage,
} from "./home-signal-stage";

describe("Home signal stage", () => {
  test.each([
    ["idle", "ready"],
    ["listening", "listening"],
    ["processing", "transcribing"],
    ["error", "error"],
  ] as const)("maps %s pill state to %s", (status, expected) => {
    expect(signalStageFromPillState(status)).toBe(expected);
  });

  test("shows Writing only for an expanded cleanup operation", () => {
    expect(shouldShowWritingStage({ expanded: true, tone: "cleanup" })).toBe(
      true,
    );
    expect(shouldShowWritingStage({ expanded: false, tone: "cleanup" })).toBe(
      false,
    );
    expect(shouldShowWritingStage({ expanded: true, tone: "preview" })).toBe(
      false,
    );
  });

  test("accepts only a verified insertion with visible text", () => {
    expect(shouldShowInsertedStage({ chars: 12, can_undo: true })).toBe(true);
    expect(shouldShowInsertedStage({ chars: 12, can_undo: false })).toBe(false);
    expect(shouldShowInsertedStage({ chars: 0, can_undo: true })).toBe(false);
  });
});
