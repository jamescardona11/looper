import { describe, expect, it } from "vitest";
import { buildMiniWaveform } from "./library-waveform";

describe("buildMiniWaveform", () => {
  it("derives height and speaker color from transcript timing data", () => {
    expect(
      buildMiniWaveform([
        { start_ms: 0, end_ms: 500, text: "One", speaker_id: "a" },
        { start_ms: 500, end_ms: 1_500, text: "Two", speaker_id: "b" },
        { start_ms: 1_500, end_ms: 2_000, text: "Three", speaker_id: "a" },
      ]),
    ).toEqual([
      { height: 13, speakerIndex: 0 },
      { height: 20, speakerIndex: 1 },
      { height: 13, speakerIndex: 0 },
    ]);
  });

  it("does not invent waveform data when no transcript segments exist", () => {
    expect(buildMiniWaveform(null)).toEqual([]);
  });
});
