import { beforeEach, describe, expect, test, vi } from "vitest";
import { createMeetingModelStore } from "./meeting-model-store";
import type {
  LocalLlmDownloadProgress,
  LocalLlmModelInfo,
  LocalLlmModelStatus,
} from "../../types";

type DownloadListeners = {
  progress?: (payload: LocalLlmDownloadProgress) => void;
  complete?: (model: string) => void;
  error?: (model: string, error: string) => void;
  cancelled?: (model: string) => void;
};

const modelInfo = (id: string): LocalLlmModelInfo => ({
  id,
  label: id,
  fileName: `${id}.gguf`,
  sizeBytes: 10,
  contextTokens: 4096,
  license: "permissive",
  attributionUrl: "https://example.com/model",
});

const modelStatus = (
  model: string,
  state: LocalLlmModelStatus["state"] = "not_installed",
): LocalLlmModelStatus => ({
  model,
  state,
  bytesOnDisk: 0,
  totalBytes: 10,
  path: "",
});

function createDependencies() {
  let downloadListeners: DownloadListeners = {};
  const stopDownloads = vi.fn();
  const dependencies = {
    listModels: vi
      .fn()
      .mockResolvedValue([modelInfo("other"), modelInfo("selected")]),
    getStatus: vi.fn().mockResolvedValue(modelStatus("selected")),
    listenDownloads: vi.fn(
      async (listeners: DownloadListeners): Promise<() => void> => {
        downloadListeners = listeners;
        return stopDownloads;
      },
    ),
    download: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return {
    dependencies,
    emitProgress: (payload: LocalLlmDownloadProgress) =>
      downloadListeners.progress?.(payload),
    emitComplete: (model: string) => downloadListeners.complete?.(model),
    emitError: (model: string, error: string) =>
      downloadListeners.error?.(model, error),
    stopDownloads,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("meeting model store", () => {
  beforeEach(() => vi.clearAllMocks());

  test("selects the requested catalog entry and follows its download events", async () => {
    const { dependencies, emitProgress, emitComplete } = createDependencies();
    const store = createMeetingModelStore("selected", dependencies);
    const unsubscribe = store.subscribe(vi.fn());
    await flushAsyncWork();

    expect(store.getSnapshot()).toMatchObject({
      info: { id: "selected" },
      status: { model: "selected", state: "not_installed" },
    });

    emitProgress({
      model: "selected",
      downloaded: 5,
      total: 10,
      percent: 50,
      verifying: false,
    });
    expect(store.getSnapshot()).toMatchObject({
      percent: 50,
      status: { state: "downloading", bytesOnDisk: 5 },
    });

    dependencies.getStatus.mockResolvedValue(modelStatus("selected", "ready"));
    emitComplete("selected");
    await flushAsyncWork();
    expect(store.getSnapshot().status?.state).toBe("ready");
    unsubscribe();
  });

  test("routes lifecycle actions and surfaces download failures", async () => {
    const { dependencies, emitError } = createDependencies();
    const store = createMeetingModelStore("selected", dependencies);
    const unsubscribe = store.subscribe(vi.fn());
    await flushAsyncWork();

    await store.download();
    await store.cancel();
    await store.remove();
    expect(dependencies.download).toHaveBeenCalledWith("selected");
    expect(dependencies.cancel).toHaveBeenCalledWith("selected");
    expect(dependencies.remove).toHaveBeenCalledWith("selected");

    emitError("selected", "Network unavailable");
    expect(store.getSnapshot().error).toBe("Network unavailable");
    unsubscribe();
  });

  test("cleans a listener that resolves after the panel is gone", async () => {
    let finishListening: ((cleanup: () => void) => void) | undefined;
    const { dependencies, stopDownloads } = createDependencies();
    dependencies.listenDownloads.mockReturnValue(
      new Promise((resolve) => {
        finishListening = resolve;
      }),
    );
    const store = createMeetingModelStore("selected", dependencies);
    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
    finishListening?.(stopDownloads);
    await flushAsyncWork();

    expect(stopDownloads).toHaveBeenCalledOnce();
  });
});
