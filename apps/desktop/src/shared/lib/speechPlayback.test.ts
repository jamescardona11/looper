import { describe, expect, test } from "vitest";
import { languageTagForSpeech, splitSpeechText } from "./speechPlayback";

describe("speech playback helpers", () => {
  test("resolves known names and preserves explicit language tags", () => {
    expect(languageTagForSpeech("Spanish")).toBe("es");
    expect(languageTagForSpeech("pt-BR")).toBe("pt-BR");
    expect(languageTagForSpeech(null)).toBe("");
  });

  test("normalizes whitespace and groups sentences within the limit", () => {
    expect(
      splitSpeechText(" First sentence.\n\nSecond sentence! ", 40),
    ).toEqual(["First sentence. Second sentence!"]);
    expect(splitSpeechText("One two three four", 8)).toEqual([
      "One two",
      "three",
      "four",
    ]);
    expect(splitSpeechText("   ")).toEqual([]);
  });
});
