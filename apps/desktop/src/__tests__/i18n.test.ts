import { describe, expect, test } from "vitest";
import { activateLocale, buildCatalogRegistry, i18n } from "../i18n";

describe("English catalog", () => {
  test("includes the meeting shortcut recovery copy", () => {
    activateLocale("en");

    // El aviso ya no promete que activar la casilla baste: el sistema puede
    // enseñarla marcada y seguir negando el permiso.
    expect(i18n._("meeting.capture.shortcut_unavailable")).toBe(
      "macOS is blocking Fn",
    );
    expect(i18n._("meeting.capture.shortcut_enable_hint")).toBe(
      "Accessibility needed",
    );
    expect(i18n._("meeting.capture.shortcut_enable")).toBe("Why?");
    expect(i18n._("settings.app.accessibility.stale_help")).toContain(
      "Remove Looper from Accessibility",
    );
  });

  test("rejects a registry without the shipped locale", () => {
    expect(() => buildCatalogRegistry({})).toThrow(
      "Missing locale catalog for en",
    );
  });

  test("ignores files outside the locale catalog layout", () => {
    const registry = buildCatalogRegistry({
      "./locales/en/messages.po": {},
      "./locales/en/notes.po": { ignored: "value" },
    });

    expect([...registry.keys()]).toEqual(["en"]);
  });
});
