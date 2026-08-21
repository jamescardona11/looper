import { describe, expect, test } from "vitest";
import {
  audioBudgetNeedsPreview,
  retentionChangePlan,
} from "../retention-policy";

describe("retention policy", () => {
  test("separates audio and transcript pruning severity", () => {
    expect(
      retentionChangePlan(
        { target: "audio", policy: "year" },
        { target: "audio", policy: "week" },
      ),
    ).toMatchObject({
      recordingPolicy: "week",
      transcriptionPolicy: "never",
      recordingMoreAggressive: true,
      transcriptionMoreAggressive: false,
    });
    expect(
      retentionChangePlan(
        { target: "audio", policy: "week" },
        { target: "transcripts", policy: "month" },
      ),
    ).toMatchObject({
      recordingMoreAggressive: false,
      transcriptionMoreAggressive: true,
    });
  });

  test("previews only reductions to a finite audio budget", () => {
    expect(audioBudgetNeedsPreview(1024, 512)).toBe(true);
    expect(audioBudgetNeedsPreview(0, 512)).toBe(true);
    expect(audioBudgetNeedsPreview(512, 1024)).toBe(false);
    expect(audioBudgetNeedsPreview(512, 0)).toBe(false);
    expect(audioBudgetNeedsPreview(512, 512)).toBe(false);
  });
});
