import { describe, expect, it } from "vitest";
import {
  languageTagForSpeech,
  splitSpeechText,
} from "../../src/shared/lib/speechPlayback";

describe("speech playback", () => {
  it("maps translation labels to platform language tags", () => {
    expect(languageTagForSpeech("Spanish")).toBe("es");
    expect(languageTagForSpeech("Chinese (Traditional)")).toBe("zh-TW");
    expect(languageTagForSpeech("en-US")).toBe("en-US");
  });

  it("chunks long text without dropping words", () => {
    const text =
      "First sentence. Second sentence with several words. Third sentence.";
    const chunks = splitSpeechText(text, 28);

    expect(chunks.every((chunk) => chunk.length <= 28)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("does not create empty utterances", () => {
    expect(splitSpeechText("  \n  ")).toEqual([]);
  });
});
