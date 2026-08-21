import { beforeEach, describe, expect, test, vi } from "vitest";
import { subscribeModelDownloadEvents } from "../model-downloads";

const tauri = vi.hoisted(() => ({ listen: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

beforeEach(() => tauri.listen.mockReset());

describe("subscribeModelDownloadEvents", () => {
  test("maps native channels to their typed payload handlers", () => {
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    tauri.listen.mockImplementation(
      (channel: string, handler: (event: { payload: unknown }) => void) => {
        listeners.set(channel, handler);
        return Promise.resolve(vi.fn());
      },
    );
    const handlers = {
      onProgress: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onCancelled: vi.fn(),
    };

    subscribeModelDownloadEvents(handlers);
    const progress = {
      model: "parakeet",
      file: "encoder.onnx",
      downloaded: 50,
      total: 100,
      percent: 50,
      verifying: false,
    };
    listeners.get("download:progress")?.({ payload: progress });
    listeners.get("download:complete")?.({ payload: { model: "parakeet" } });
    listeners.get("download:error")?.({
      payload: { model: "parakeet", error: "network" },
    });
    listeners.get("download:cancelled")?.({
      payload: { model: "parakeet" },
    });

    expect([...listeners.keys()]).toEqual([
      "download:progress",
      "download:complete",
      "download:error",
      "download:cancelled",
    ]);
    expect(handlers.onProgress).toHaveBeenCalledWith(progress);
    expect(handlers.onComplete).toHaveBeenCalledWith({ model: "parakeet" });
    expect(handlers.onError).toHaveBeenCalledWith({
      model: "parakeet",
      error: "network",
    });
    expect(handlers.onCancelled).toHaveBeenCalledWith({ model: "parakeet" });
  });
});
