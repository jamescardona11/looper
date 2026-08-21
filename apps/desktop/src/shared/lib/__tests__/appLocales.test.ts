import { describe, expect, test } from "vitest";
import {
  buildAppLocaleOptions,
  normalizeSupportedAppLocale,
  parseLocaleCatalog,
  SUPPORTED_APP_LOCALES,
} from "../appLocales";

describe("app locales", () => {
  test("validates a unique normalized locale catalog", () => {
    expect(parseLocaleCatalog(["en", "es"])).toEqual(["en", "es"]);
    expect(() => parseLocaleCatalog([])).toThrow("non-empty array");
    expect(() => parseLocaleCatalog(["en", "EN"])).toThrow(
      "lowercase trimmed strings",
    );
    expect(() => parseLocaleCatalog(["en", "en"])).toThrow(
      "Duplicate app locale",
    );
  });

  test("uses a supported exact or base locale and falls back to English", () => {
    expect(SUPPORTED_APP_LOCALES).toContain("en");
    expect(normalizeSupportedAppLocale("en_US")).toBe("en");
    expect(normalizeSupportedAppLocale("fr-FR")).toBe("en");
    expect(normalizeSupportedAppLocale(null)).toBe("en");
  });

  test("places the system selection before shipped locales", () => {
    const options = buildAppLocaleOptions("System default");
    expect(options[0]).toEqual({ value: "system", label: "System default" });
    expect(options.map((option) => option.value)).toEqual(["system", "en"]);
  });
});
