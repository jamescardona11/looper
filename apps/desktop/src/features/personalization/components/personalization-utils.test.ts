import { afterEach, describe, expect, test, vi } from "vitest";

import {
  appBindingKey,
  buildWebsiteIconMap,
  clampInstructionsHeight,
  clampInstructionsText,
  countInstructionsChars,
  createId,
  formatWebsitePreview,
  getInitials,
  getWebsiteFallback,
  isValidDomain,
  normalizeEntry,
  normalizeWebsite,
  shouldReplaceAppBinding,
} from "./personalization-utils";

afterEach(() => vi.unstubAllGlobals());

describe("personalization app bindings", () => {
  test("prefers stable identifiers and falls back to normalized names", () => {
    expect(appBindingKey({ name: " Notes ", identifier: " COM.APP.Notes " })).toBe(
      "com.app.notes",
    );
    expect(appBindingKey({ name: " Notes ", identifier: null })).toBe(
      "name:notes",
    );
  });

  test("upgrades a name-only binding when an identifier becomes available", () => {
    expect(
      shouldReplaceAppBinding(
        { name: "Notes", identifier: null },
        { name: " notes ", identifier: "com.app.notes" },
      ),
    ).toBe(true);
    expect(
      shouldReplaceAppBinding(
        { name: "Mail", identifier: "com.app.mail" },
        { name: "Notes", identifier: "com.app.notes" },
      ),
    ).toBe(false);
  });
});

describe("personalization instruction limits", () => {
  test("counts and clamps Unicode code points rather than UTF-16 units", () => {
    expect(countInstructionsChars("A🙂B")).toBe(3);
    expect(clampInstructionsText("🙂".repeat(3_001))).toBe("🙂".repeat(3_000));
    expect(normalizeEntry("  concise  ")).toBe("concise");
  });

  test("keeps the instruction editor within its existing height range", () => {
    expect(clampInstructionsHeight(20)).toBe(102);
    expect(clampInstructionsHeight(180)).toBe(180);
    expect(clampInstructionsHeight(500)).toBe(320);
  });
});

describe("personalization website identity", () => {
  test("normalizes website origins and preview labels", () => {
    expect(normalizeWebsite(" HTTPS://WWW.Example.COM/docs ")).toBe(
      "example.com",
    );
    expect(formatWebsitePreview("example.com")).toBe("example");
    expect(formatWebsitePreview("localhost")).toBe("localhost");
  });

  test("validates DNS-style domains", () => {
    expect(isValidDomain("docs.example.com")).toBe(true);
    expect(isValidDomain("-docs.example.com")).toBe(false);
    expect(isValidDomain("localhost")).toBe(false);
  });

  test("builds fallbacks and a normalized icon lookup", () => {
    expect(getWebsiteFallback("https://example.com/docs")).toBe("E");
    expect(getWebsiteFallback("  ")).toBe("•");
    expect(
      buildWebsiteIconMap([
        { site: "https://example.com", icon_path: "/first.png" },
        { site: "www.example.com/docs", icon_path: "/latest.png" },
        { site: "ignored.test", icon_path: null },
      ]),
    ).toEqual({ "example.com": "/latest.png" });
  });
});

describe("personalization display identity", () => {
  test("creates initials for empty, single, and multi-word names", () => {
    expect(getInitials(" ")).toBe("?");
    expect(getInitials("looper")).toBe("LO");
    expect(getInitials("Ada Lovelace Byron")).toBe("AL");
  });

  test("uses the platform UUID generator when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "fixed-uuid" });
    expect(createId()).toBe("fixed-uuid");
  });
});
