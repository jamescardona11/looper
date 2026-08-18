import { describe, expect, test } from "vitest";
import { colors } from "./colors";

describe("mobile desktop theme parity", () => {
  test("uses the dark desktop token values", () => {
    expect(colors).toMatchObject({
      background: "#141519",
      surface: "#24252d",
      border: "#2c2e38",
      text: "#f0f1f4",
      textSecondary: "#b8bac4",
      muted: "#82858f",
      accent: "#8f9cff",
      accentLight: "#aab5ff",
      accentDark: "#6675dc",
      pillShell: "#111316",
      pillBorder: "#2a3028",
      pillDotBase: "#282828",
      pillDotHighlight: "#ffffff",
      danger: "#ef4444",
    });
  });
});
