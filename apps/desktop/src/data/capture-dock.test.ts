import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  getCapturePillPreferences,
  onCapturePillPreferencesChanged,
  setCapturePillDockPosition,
  setCapturePillPresentation,
  setDictationLanguage,
  startDictationFromDock,
} from "./dictation";
import { startNoteFromDock } from "./notetaking";

describe("capture dock native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes dictation, note, and preference commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await startDictationFromDock();
    await startNoteFromDock();
    await setDictationLanguage("es");
    await getCapturePillPreferences();
    await setCapturePillPresentation("floating");
    await setCapturePillDockPosition("bottom_center");

    expect(tauri.invoke.mock.calls).toEqual([
      ["start_dictation_from_dock"],
      ["start_note_from_dock"],
      ["set_dictation_language", { language: "es" }],
      ["get_capture_pill_preferences"],
      ["set_capture_pill_presentation", { presentation: "floating" }],
      ["set_capture_pill_dock_position", { dockPosition: "bottom_center" }],
    ]);
  });

  test("unwraps capture preference events", async () => {
    const handler = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());
    await onCapturePillPreferencesChanged(handler);

    const preferences = {
      presentation: "dock",
      dockPosition: "top_center",
      language: "en",
    };
    tauri.listen.mock.calls[0]?.[1]({ payload: preferences });

    expect(tauri.listen).toHaveBeenCalledWith(
      "capture-pill:preferences",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(preferences);
  });
});
