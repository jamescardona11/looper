import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  cancelRecording,
  finishRecording,
  listInputDevices,
  subscribeAudioSpectrum,
  subscribeInputDevicesChanged,
  subscribeRecordingStart,
} from "../audio";

describe("audio native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes recorder commands through the native boundary", async () => {
    const devices = [{ id: "default", name: "Mac", is_default: true }];
    tauri.invoke.mockResolvedValueOnce(devices).mockResolvedValue(undefined);

    await expect(listInputDevices()).resolves.toEqual(devices);
    await cancelRecording();
    await finishRecording();

    expect(tauri.invoke.mock.calls).toEqual([
      ["list_input_devices"],
      ["cancel_recording"],
      ["finish_recording"],
    ]);
  });

  test("subscribes to recorder, spectrum, and device channels", async () => {
    const started = vi.fn();
    const spectrum = vi.fn();
    const devicesChanged = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());

    await subscribeRecordingStart(started);
    await subscribeAudioSpectrum(spectrum);
    await subscribeInputDevicesChanged(devicesChanged);

    tauri.listen.mock.calls[0]?.[1]({ payload: undefined });
    tauri.listen.mock.calls[1]?.[1]({ payload: { bins: [0.1, 0.4] } });
    tauri.listen.mock.calls[2]?.[1]({ payload: undefined });

    expect(tauri.listen.mock.calls.map(([channel]) => channel)).toEqual([
      "recording:start",
      "audio:spectrum",
      "audio:input-devices-changed",
    ]);
    expect(started).toHaveBeenCalledOnce();
    expect(spectrum).toHaveBeenCalledWith({ bins: [0.1, 0.4] });
    expect(devicesChanged).toHaveBeenCalledOnce();
  });
});
