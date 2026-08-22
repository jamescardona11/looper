// Data boundary for the "recorder/audio" domain (grabación).
//
// This is the ONLY module allowed to import `invoke`/`listen` from
// `@tauri-apps/api/*` for this domain (see apps/desktop/eslint.config.js,
// rule `no-restricted-imports`). Components/hooks call these functions
// instead of talking to Tauri directly.
//
// Backs: src-tauri/src/recorder.rs, src-tauri/src/audio.rs,
// src-tauri/src/platform/macos/audio_devices.rs.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AudioSpectrumPayload, DeviceInfo } from "../../contracts/index";

export async function listInputDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("list_input_devices");
}

export async function cancelRecording(): Promise<void> {
  await invoke("cancel_recording");
}

export async function finishRecording(): Promise<void> {
  await invoke("finish_recording");
}

/** Fires once per recording start, no payload. */
export function subscribeRecordingStart(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("recording:start", () => handler());
}

export function subscribeAudioSpectrum(
  handler: (payload: AudioSpectrumPayload) => void,
): Promise<UnlistenFn> {
  return listen<AudioSpectrumPayload>("audio:spectrum", ({ payload }) =>
    handler(payload),
  );
}

/** Fires when the OS input device list changes, no payload. */
export function subscribeInputDevicesChanged(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("audio:input-devices-changed", () => handler());
}
