import { describe, expect, test } from "vitest";
import {
  meetingAiRefreshInterval,
  meetingAiStatusKey,
} from "../local-llm-queries";

describe("meeting intelligence query", () => {
  test("polls only while a local model changes state", () => {
    expect(meetingAiRefreshInterval("downloading")).toBe(1_000);
    expect(meetingAiRefreshInterval("verifying")).toBe(1_000);
    expect(meetingAiRefreshInterval("ready")).toBe(false);
    expect(meetingAiRefreshInterval(undefined)).toBe(false);
  });

  test("uses one stable status key", () => {
    expect(meetingAiStatusKey).toEqual(["meeting-ai", "status"]);
  });
});
