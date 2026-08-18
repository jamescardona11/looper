import { describe, expect, test } from "vitest";
import { buildAnimatedTextTokens } from "./pill-expanded-text-model";

describe("buildAnimatedTextTokens", () => {
  test("preserves exact text, whitespace and source offsets", () => {
    const tokens = buildAnimatedTextTokens("Hola  mundo", new Set());

    expect(
      tokens.map(({ key, text, isWhitespace }) => ({
        key,
        text,
        isWhitespace,
      })),
    ).toEqual([
      { key: 0, text: "Hola", isWhitespace: false },
      { key: 4, text: "  ", isWhitespace: true },
      { key: 6, text: "mundo", isWhitespace: false },
    ]);
    expect(tokens.map(({ delay }) => delay)).toEqual([0, 0, 0.12]);
  });

  test("only staggers words that were not present in the previous frame", () => {
    const tokens = buildAnimatedTextTokens(
      "Hola mundo nuevo final",
      new Set([0, 5]),
    );

    expect(tokens.filter(({ isWhitespace }) => !isWhitespace)).toEqual([
      { key: 0, text: "Hola", isWhitespace: false, delay: 0 },
      { key: 5, text: "mundo", isWhitespace: false, delay: 0 },
      { key: 11, text: "nuevo", isWhitespace: false, delay: 0 },
      { key: 17, text: "final", isWhitespace: false, delay: 0.12 },
    ]);
  });
});
