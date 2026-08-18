import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  hide: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ hide: tauri.hide }),
}));

import {
  hideToastWindow,
  runToastAction,
  setToastInteractive,
  subscribeToastHide,
  subscribeToastShow,
} from "./toast";

describe("toast native gateway", () => {
  beforeEach(() => {
    tauri.hide.mockReset();
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("unwraps show events and preserves the hide channel", async () => {
    const show = vi.fn();
    const hide = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());

    await subscribeToastShow(show);
    await subscribeToastHide(hide);
    const payload = { type: "success", message: "Saved" };
    tauri.listen.mock.calls[0]?.[1]({ payload });
    tauri.listen.mock.calls[1]?.[1]({ payload: undefined });

    expect(show).toHaveBeenCalledWith(payload);
    expect(hide).toHaveBeenCalledOnce();
  });

  test("coordinates interaction, dismissal, and dynamic actions", async () => {
    tauri.invoke.mockResolvedValue(undefined);
    tauri.hide.mockResolvedValue(undefined);

    await setToastInteractive(true);
    await hideToastWindow();
    await runToastAction("open_library", { id: "item-1" });

    expect(tauri.invoke.mock.calls).toEqual([
      ["set_toast_interactive", { interactive: true }],
      ["toast_dismissed"],
      ["open_library", { id: "item-1" }],
    ]);
    expect(tauri.hide).toHaveBeenCalledOnce();
  });
});
