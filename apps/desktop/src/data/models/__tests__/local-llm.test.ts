import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  cancelLocalLlmModelDownload,
  deleteLocalLlmModel,
  downloadLocalLlmModel,
  getLocalLlmModelStatus,
  getMeetingAiStatus,
  listLocalLlmModels,
  listenLocalLlmDownloads,
} from "../local-llm";

describe("local intelligence native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes model lifecycle and meeting status commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await listLocalLlmModels();
    await getLocalLlmModelStatus("qwen-local");
    await downloadLocalLlmModel("qwen-local");
    await cancelLocalLlmModelDownload("qwen-local");
    await deleteLocalLlmModel("qwen-local");
    await getMeetingAiStatus();

    expect(tauri.invoke.mock.calls).toEqual([
      ["list_local_llm_models"],
      ["get_local_llm_model_status", { model: "qwen-local" }],
      ["download_local_llm_model", { model: "qwen-local" }],
      ["cancel_local_llm_model_download", { model: "qwen-local" }],
      ["delete_local_llm_model", { model: "qwen-local" }],
      ["get_meeting_ai_status"],
    ]);
  });

  test("combines all download channels behind one cleanup", async () => {
    const unlisteners = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const pendingUnlisteners = [...unlisteners];
    tauri.listen.mockImplementation(async () => pendingUnlisteners.shift());
    const listeners = {
      progress: vi.fn(),
      complete: vi.fn(),
      error: vi.fn(),
      cancelled: vi.fn(),
    };

    const unlisten = await listenLocalLlmDownloads(listeners);
    tauri.listen.mock.calls[0]?.[1]({
      payload: { model: "qwen", percent: 50 },
    });
    tauri.listen.mock.calls[1]?.[1]({ payload: { model: "qwen" } });
    tauri.listen.mock.calls[2]?.[1]({
      payload: { model: "qwen", error: "network" },
    });
    tauri.listen.mock.calls[3]?.[1]({ payload: { model: "qwen" } });
    unlisten();

    expect(listeners.progress).toHaveBeenCalledWith({
      model: "qwen",
      percent: 50,
    });
    expect(listeners.complete).toHaveBeenCalledWith("qwen");
    expect(listeners.error).toHaveBeenCalledWith("qwen", "network");
    expect(listeners.cancelled).toHaveBeenCalledWith("qwen");
    unlisteners.forEach((cleanup) => expect(cleanup).toHaveBeenCalledOnce());
  });
});
