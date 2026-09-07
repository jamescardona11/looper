import { describe, expect, it } from "vitest";
import { buildWidgetSummary } from "../widget-summary";

describe("buildWidgetSummary", () => {
  it("uses only this week's words and exposes the most recent capture", () => {
    const now = Date.now();
    const summary = buildWidgetSummary(
      [
        {
          id: "latest",
          title: "Idea reciente",
          body: "una dos tres",
          kind: "dictation",
          createdAt: now - 1_000,
          updatedAt: now - 1_000,
        },
        {
          id: "old",
          title: "Nota antigua",
          body: "no debe contar",
          kind: "note",
          createdAt: now - 8 * 24 * 60 * 60 * 1_000,
          updatedAt: now - 8 * 24 * 60 * 60 * 1_000,
        },
      ],
      [],
    );

    expect(summary).toEqual({
      lastCaptureDetail: "Última captura · Dictado",
      lastCaptureTitle: "Idea reciente",
      weeklyWordCount: 3,
    });
  });
});
