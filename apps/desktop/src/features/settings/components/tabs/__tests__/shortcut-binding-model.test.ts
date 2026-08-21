import { describe, expect, test } from "vitest";
import { shortcutBindingView } from "../shortcut-binding-model";

const binding = (shortcut: string) => ({
  shortcut,
  temporary: false,
  cleanup_enabled: false,
});

describe("shortcut binding view", () => {
  test("supplies an editable primary row for an empty shortcut mode", () => {
    const view = shortcutBindingView({
      mode: "smart",
      bindings: [],
      activeCapture: null,
      emptyLabel: "+ Add shortcut",
    });

    expect(view.primary).toMatchObject({
      index: 0,
      display: "+ Add shortcut",
      capturing: false,
    });
    expect(view.alternatives).toEqual([]);
    expect(view.canAdd).toBe(true);
  });

  test("caps additions and maps capture and validation by index", () => {
    const view = shortcutBindingView({
      mode: "hold",
      bindings: [
        binding("Command+A"),
        binding("Command+B"),
        binding("Command+C"),
      ],
      invalidDrafts: { 1: "Already used" },
      activeCapture: { mode: "hold", index: 2 },
      emptyLabel: "+ Add shortcut",
    });

    expect(view.alternativeCount).toBe(2);
    expect(view.canAdd).toBe(false);
    expect(view.alternatives[0]).toMatchObject({
      index: 1,
      error: "Already used",
      capturing: false,
    });
    expect(view.alternatives[1]).toMatchObject({ index: 2, capturing: true });
  });
});
