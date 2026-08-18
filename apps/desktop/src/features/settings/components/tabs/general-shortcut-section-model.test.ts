import { describe, expect, test, vi } from "vitest";
import type { GeneralShortcutProps } from "./GeneralTab.types";
import { shortcutModeItems } from "./general-shortcut-section-model";

const props = (overrides: Partial<GeneralShortcutProps> = {}) =>
  ({
    smartEnabled: true,
    setSmartEnabled: vi.fn(),
    holdEnabled: false,
    setHoldEnabled: vi.fn(),
    toggleEnabled: false,
    setToggleEnabled: vi.fn(),
    shortcutBindings: { smart: [], hold: [], toggle: [] },
    invalidShortcutDrafts: {},
    captureActive: null,
    capturePreview: "",
    onStartCapture: vi.fn(),
    updateShortcutBinding: vi.fn(),
    addShortcutBinding: vi.fn(),
    removeShortcutBinding: vi.fn(),
    aiFeaturesReady: true,
    ...overrides,
  }) satisfies GeneralShortcutProps;

const labels = {
  smart: { label: "Dictation", description: "Smart" },
  hold: { label: "Hold", description: "Hold" },
  toggle: { label: "Toggle", description: "Toggle" },
};

describe("general shortcut mode policy", () => {
  test("keeps the last active mode enabled", () => {
    const items = shortcutModeItems(props(), labels);
    expect(
      items.map(({ mode, enabled, canDisable }) => ({
        mode,
        enabled,
        canDisable,
      })),
    ).toEqual([
      { mode: "smart", enabled: true, canDisable: false },
      { mode: "hold", enabled: false, canDisable: true },
      { mode: "toggle", enabled: false, canDisable: true },
    ]);
  });

  test("routes each mode to its matching setter", () => {
    const state = props({ holdEnabled: true });
    const items = shortcutModeItems(state, labels);
    items.find(({ mode }) => mode === "toggle")?.setEnabled(true);
    expect(state.setToggleEnabled).toHaveBeenCalledWith(true);
    expect(items[0]?.canDisable).toBe(true);
  });
});
