// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  subscribeOverlayPosition,
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

  test("restores a canonical anchor through the native owner", async () => {
    const position = { x: 120, y: 80 };
    tauri.invoke.mockResolvedValue(position);

    await expect(setOverlayPosition(position)).resolves.toEqual(position);

    expect(tauri.invoke.mock.calls).toEqual([
      ["set_overlay_position", position],
    ]);
  });

  test("updates meeting presentation through the native owner", async () => {
    tauri.invoke.mockResolvedValue({
      placement: "above",
      sideAlignment: "top",
    });

    const result = await setMeetingOverlayPresentation({
      compact: false,
      transcriptVisible: true,
      transcriptPinned: false,
    });

    expect(result).toEqual({ placement: "above", sideAlignment: "top" });
  });

  test("unwraps pill insertion and mode events", async () => {
    const position = vi.fn();
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

    await subscribeOverlayPosition(position);
    tauri.listen.mock.calls[2]?.[1]({ payload: { x: 120, y: 50 } });
    expect(tauri.listen.mock.calls[2]?.[0]).toBe("pill:position");
    expect(position).toHaveBeenCalledWith({ x: 120, y: 50 });
    expect(inserted).toHaveBeenCalledWith({ chars: 12, can_undo: true });
    expect(mode).toHaveBeenCalledWith({ expanded: true, tone: "preview" });
  });
});
