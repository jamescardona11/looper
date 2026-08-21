import { describe, expect, it } from "vitest";
import { evaluateLocalSttSmokeTranscript } from "../local-stt-smoke";

describe("local Parakeet smoke evaluation", () => {
  it("accepts the three anchors from the canonical speech fixture", () => {
    expect(
      evaluateLocalSttSmokeTranscript(
        "The stale smell of old beer lingers. A cold dip restores health and zest. Tacos al pastor are my favorite.",
      ),
    ).toEqual({ ok: true, missingPhrases: [] });
  });

  it("normalizes punctuation but rejects an incomplete transcript", () => {
    expect(
      evaluateLocalSttSmokeTranscript(
        "STALE SMELL OF OLD BEER LINGERS, COLD DIP RESTORES HEALTH AND ZEST.",
      ),
    ).toEqual({ ok: false, missingPhrases: ["tacos al pastor are my favorite"] });
  });
});
