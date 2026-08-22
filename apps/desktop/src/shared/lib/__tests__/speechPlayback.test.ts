import { describe, expect, test } from "vitest";
import { languageTagForSpeech, splitSpeechText } from "../speechPlayback";

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

  // Merged from the former tests/frontend/speech-playback.test.ts: that tree is
  // reserved for cross-cutting contracts, and these exercise one module.
  test("maps a regional translation label to its platform tag", () => {
    expect(languageTagForSpeech("Chinese (Traditional)")).toBe("zh-TW");
    expect(languageTagForSpeech("en-US")).toBe("en-US");
  });

  test("chunks long text without dropping words", () => {
    const text =
      "First sentence. Second sentence with several words. Third sentence.";
    const chunks = splitSpeechText(text, 28);

    expect(chunks.every((chunk) => chunk.length <= 28)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  test("does not create empty utterances from whitespace-only input", () => {
    expect(splitSpeechText("  \n  ")).toEqual([]);
  });
});
