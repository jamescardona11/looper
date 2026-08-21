import { describe, expect, test } from "vitest";

import type { ShortcutBindings, StoredSettings } from "../../../../types/index";
import {
  createDefaultShortcutBindings,
  getPrimaryShortcut,
  indexInvalidShortcutDraft,
  recoverInvalidShortcutDraft,
  removeShortcutCleanup,
  resolveDefaultSmartShortcut,
  restoreShortcutBindings,
} from "../settings-shortcut-model";

const binding = (shortcut: string, cleanupEnabled = false) => ({
  shortcut,
  temporary: false,
  cleanup_enabled: cleanupEnabled,
});

const settingsSource = (
  shortcutBindings: ShortcutBindings,
): Pick<
  StoredSettings,
  | "shortcut_bindings"
  | "smart_shortcut"
  | "hold_shortcut"
  | "toggle_shortcut"
  | "cleanup_enabled"
> => ({
  shortcut_bindings: shortcutBindings,
  smart_shortcut: "LegacySmart",
  hold_shortcut: "LegacyHold",
  toggle_shortcut: "LegacyToggle",
  cleanup_enabled: true,
});

describe("settings shortcut model", () => {
  test("selects the platform default and builds independent mode bindings", () => {
    expect(resolveDefaultSmartShortcut("macos")).toBe("Fn");
    expect(resolveDefaultSmartShortcut("windows")).toBe("Control+Space");

    expect(createDefaultShortcutBindings("linux")).toEqual({
      smart: [binding("Control+Space")],
      hold: [binding("Control+Shift+Space")],
      toggle: [binding("Control+Alt+Space")],
    });
  });

  test("restores each missing mode from its legacy setting", () => {
    const restored = restoreShortcutBindings(
      settingsSource({
        smart: [],
        hold: [binding("CurrentHold")],
        toggle: [],
      }),
    );

    expect(restored).toEqual({
      smart: [binding("LegacySmart", true)],
      hold: [binding("CurrentHold")],
      toggle: [binding("LegacyToggle", true)],
    });
  });

  test("removes cleanup without mutating the current bindings", () => {
    const current = createDefaultShortcutBindings("macos");
    current.smart[0] = binding("Fn", true);

    const sanitized = removeShortcutCleanup(current);

    expect(sanitized.smart[0]?.cleanup_enabled).toBe(false);
    expect(current.smart[0]?.cleanup_enabled).toBe(true);
  });

  test("restores an edited binding from the persisted snapshot", () => {
    const persisted = createDefaultShortcutBindings("macos");
    const edited = {
      ...persisted,
      smart: [binding("Invalid")],
    };

    const recovered = recoverInvalidShortcutDraft(
      edited,
      { target: { mode: "smart", index: 0 }, message: "Invalid shortcut" },
      persisted,
    );

    expect(getPrimaryShortcut(recovered, "smart", "fallback")).toBe("Fn");
  });

  test("removes an invalid binding that was never persisted", () => {
    const persisted = createDefaultShortcutBindings("macos");
    const edited = {
      ...persisted,
      toggle: [...persisted.toggle, binding("Invalid")],
    };

    expect(
      recoverInvalidShortcutDraft(
        edited,
        { target: { mode: "toggle", index: 1 }, message: "Conflict" },
        persisted,
      ).toggle,
    ).toEqual(persisted.toggle);
  });

  test("indexes a validation message by mode and binding position", () => {
    expect(
      indexInvalidShortcutDraft({
        target: { mode: "hold", index: 2 },
        message: "Already used",
      }),
    ).toEqual({ hold: { 2: "Already used" } });
    expect(indexInvalidShortcutDraft(null)).toEqual({});
  });
});
