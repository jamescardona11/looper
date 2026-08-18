import { describe, expect, test } from "vitest";

import { parseThemePreference, themeForDocument } from "./document-theme";

describe("document theme policy", () => {
  test("normalizes stored preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("unexpected")).toBe("system");
  });

  test("resolves system preferences only in system mode", () => {
    expect(themeForDocument("system", true)).toBe("light");
    expect(themeForDocument("system", false)).toBe("dark");
    expect(themeForDocument("dark", true)).toBe("dark");
  });
});
