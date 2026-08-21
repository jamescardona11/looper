// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT,
  persistOverlayPosition,
  setMeetingOverlayPresentation,
  setOverlayPosition,
  subscribePillInserted,
  subscribePillMode,
} from "../overlay";

describe("overlay native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("keeps automatic and persisted movement as separate commands", async () => {
    const position = { x: 120, y: 80 };
    tauri.invoke.mockResolvedValue(position);

    await expect(setOverlayPosition(position)).resolves.toEqual(position);
    await expect(persistOverlayPosition(position)).resolves.toEqual(position);

    expect(tauri.invoke.mock.calls).toEqual([
      ["set_overlay_position", position],
      ["persist_overlay_position", position],
    ]);
  });

  test("announces native layout moves before resizing the meeting surface", async () => {
    const moved = vi.fn();
    window.addEventListener(OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT, moved);
    tauri.invoke.mockResolvedValue({
      placement: "above",
      sideAlignment: "top",
    });

    const result = await setMeetingOverlayPresentation({
      compact: false,
      transcriptVisible: true,
      transcriptPinned: false,
    });

    expect(moved).toHaveBeenCalledOnce();
    expect(result).toEqual({ placement: "above", sideAlignment: "top" });
    window.removeEventListener(OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT, moved);
  });

  test("unwraps pill insertion and mode events", async () => {
    const inserted = vi.fn();
    const mode = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());

    await subscribePillInserted(inserted);
    await subscribePillMode(mode);
    tauri.listen.mock.calls[0]?.[1]({
      payload: { chars: 12, can_undo: true },
    });
    tauri.listen.mock.calls[1]?.[1]({
      payload: { expanded: true, tone: "preview" },
    });

    expect(inserted).toHaveBeenCalledWith({ chars: 12, can_undo: true });
    expect(mode).toHaveBeenCalledWith({ expanded: true, tone: "preview" });
  });
});
