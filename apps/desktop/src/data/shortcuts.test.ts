import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  checkShortcutPermission,
  openShortcutPermissionSettings,
  retryShortcuts,
  subscribeShortcutCapture,
} from "./shortcuts";

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

beforeEach(() => vi.clearAllMocks());

describe("shortcut data bridge", () => {
  test("invokes the native permission and retry commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);
    await checkShortcutPermission();
    await retryShortcuts();
    await openShortcutPermissionSettings();

    expect(tauri.invoke.mock.calls).toEqual([
      ["check_accessibility_permission"],
      ["retry_shortcuts"],
      ["open_accessibility_settings"],
    ]);
  });

  test("unwraps shortcut capture event payloads", async () => {
    const handler = vi.fn();
    const unlisten = vi.fn();
    tauri.listen.mockImplementation((_channel, listener) => {
      listener({ payload: { kind: "captured", shortcut: "Control+K" } });
      return Promise.resolve(unlisten);
    });

    await expect(subscribeShortcutCapture(handler)).resolves.toBe(unlisten);
    expect(tauri.listen).toHaveBeenCalledWith(
      "shortcut:capture",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith({
      kind: "captured",
      shortcut: "Control+K",
    });
  });
});
