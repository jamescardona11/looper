import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  emit: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: tauri.emit,
  listen: tauri.listen,
}));

import {
  getSettings,
  notifySettingsRendererReady,
  openDataDirectory,
  subscribeSettingsChanged,
  subscribeTextSizeChanged,
  updateSettings,
} from "../settings";

describe("settings native gateway", () => {
  beforeEach(() => {
    tauri.emit.mockReset();
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("uses the settings commands with their native argument shapes", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await getSettings();
    await updateSettings({ theme_mode: "dark" });
    await openDataDirectory("/tmp/looper");

    expect(tauri.invoke).toHaveBeenNthCalledWith(1, "get_settings");
    expect(tauri.invoke).toHaveBeenNthCalledWith(2, "update_settings", {
      args: { theme_mode: "dark" },
    });
    expect(tauri.invoke).toHaveBeenNthCalledWith(3, "open_data_dir", {
      path: "/tmp/looper",
    });
  });

  test("unwraps settings and text-size event payloads", async () => {
    const settingsHandler = vi.fn();
    const textSizeHandler = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());

    await subscribeSettingsChanged(settingsHandler);
    await subscribeTextSizeChanged(textSizeHandler);

    const settingsListener = tauri.listen.mock.calls[0]?.[1];
    const textSizeListener = tauri.listen.mock.calls[1]?.[1];
    const settings = { theme_mode: "dark" };
    settingsListener({ payload: settings });
    textSizeListener({ payload: { mode: "large" } });

    expect(settingsHandler).toHaveBeenCalledWith(settings);
    expect(textSizeHandler).toHaveBeenCalledWith("large");
  });

  test("announces that the settings renderer is ready", async () => {
    tauri.emit.mockResolvedValue(undefined);
    await notifySettingsRendererReady();
    expect(tauri.emit).toHaveBeenCalledWith("settings:renderer_ready");
  });
});
