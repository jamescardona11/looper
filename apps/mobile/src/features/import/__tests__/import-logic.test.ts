import { describe, expect, it, vi } from "vitest";
import { parseMobileImport } from "../import-logic";

describe("parseMobileImport", () => {
  it("adapts an Aqua-style export", () => {
    const bundle = parseMobileImport(
      "aqua.json",
      JSON.stringify({
        dictionary: ["Looper", "Parakeet"],
        replacements: [{ from: "j once", to: "J11" }],
        customInstructions: "Keep email concise.",
        language: "es",
        history: [{ text: "Imported thought", timestamp: 1_700_000_000 }],
      }),
    );
    expect(bundle).toMatchObject({
      source: "Aqua Voice",
      dictionary: ["Looper", "Parakeet"],
      replacements: [{ source: "j once", destination: "J11" }],
      styles: [{ name: "Aqua Voice", instructions: "Keep email concise." }],
      language: "es",
    });
    expect(bundle.transcripts[0]?.occurredAt).toBe(1_700_000_000_000);
  });

  it("imports a plain text export as one dictation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));
    expect(parseMobileImport("notes.md", "  A saved voice note.  ").transcripts).toEqual([
      { text: "A saved voice note.", occurredAt: Date.now() },
    ]);
    vi.useRealTimers();
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseMobileImport("other.json", '{"theme":"dark"}')).toThrow("No encontramos");
  });
});
