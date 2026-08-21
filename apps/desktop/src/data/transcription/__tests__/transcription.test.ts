import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  cancelDownload,
  deleteTranscription,
  downloadModel,
  fetchRemoteSpeechModels,
  getTranscriptions,
  previewAudioStorageBudget,
  subscribeDownloadEvents,
  subscribeTranscriptionEvents,
} from "../../transcription";

describe("transcription native boundary", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes model, remote catalog, history, and retention commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await downloadModel("parakeet", true);
    await cancelDownload("parakeet");
    await fetchRemoteSpeechModels({
      endpoint: "https://speech",
      apiKey: "key",
    });
    await deleteTranscription("record-1");
    await previewAudioStorageBudget(512);

    expect(tauri.invoke.mock.calls).toEqual([
      ["download_model", { model: "parakeet", ane: true }],
      ["cancel_download", { model: "parakeet" }],
      [
        "fetch_remote_speech_models",
        { endpoint: "https://speech", apiKey: "key" },
      ],
      ["delete_transcription", { id: "record-1" }],
      ["preview_audio_storage_budget", { budgetMb: 512 }],
    ]);
  });

  test("normalizes a missing transcription collection", async () => {
    tauri.invoke.mockResolvedValue(null);
    await expect(getTranscriptions()).resolves.toEqual([]);
  });

  test("subscribes only requested event channels and unwraps payloads", async () => {
    tauri.listen.mockResolvedValue(vi.fn());
    const progress = vi.fn();
    const complete = vi.fn();
    const error = vi.fn();

    const downloads = subscribeDownloadEvents({ onProgress: progress });
    const transcriptions = subscribeTranscriptionEvents({
      onComplete: complete,
      onError: error,
    });
    await Promise.all([...downloads, ...transcriptions]);

    expect(tauri.listen.mock.calls.map(([channel]) => channel)).toEqual([
      "download:progress",
      "transcription:complete",
      "transcription:error",
    ]);
    tauri.listen.mock.calls[0]?.[1]({
      payload: { model: "parakeet", percent: 50 },
    });
    tauri.listen.mock.calls[1]?.[1]({ payload: { record: null } });
    tauri.listen.mock.calls[2]?.[1]({ payload: undefined });

    expect(progress).toHaveBeenCalledWith({ model: "parakeet", percent: 50 });
    expect(complete).toHaveBeenCalledWith({ record: null });
    expect(error).toHaveBeenCalledOnce();
  });
});
