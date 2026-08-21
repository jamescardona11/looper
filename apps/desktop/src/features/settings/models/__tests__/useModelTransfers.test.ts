// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ModelDownloadEventHandlers } from "../../../../data/model-downloads";

const mocks = vi.hoisted(() => ({
  downloadModel: vi.fn(),
  deleteModel: vi.fn(),
  cancelDownload: vi.fn(),
  useEvents: vi.fn(),
}));

vi.mock("../../../../data/transcription", () => ({
  downloadModel: mocks.downloadModel,
  deleteModel: mocks.deleteModel,
  cancelDownload: mocks.cancelDownload,
}));
vi.mock("../../../../shared/hooks/useModelDownloadEvents", () => ({
  useModelDownloadEvents: mocks.useEvents,
}));

import { modelTransferReducer, useModelTransfers } from "../useModelTransfers";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.downloadModel.mockResolvedValue({ installed: true });
  mocks.deleteModel.mockResolvedValue({ installed: false });
  mocks.cancelDownload.mockResolvedValue(undefined);
});

describe("model transfer reducer", () => {
  test("tracks startup, bounded progress, and completion", () => {
    let state = modelTransferReducer({}, { type: "start", model: "small" });
    expect(state.small).toEqual({
      status: "downloading",
      percent: 0,
      file: "starting",
    });

    state = modelTransferReducer(state, {
      type: "progress",
      payload: {
        model: "small",
        percent: 140,
        file: "weights.bin",
        downloaded: 140,
        total: 100,
        verifying: true,
      },
    });
    expect(state.small).toEqual({
      status: "downloading",
      percent: 100,
      file: "weights.bin",
      verifying: true,
    });

    state = modelTransferReducer(state, { type: "complete", model: "small" });
    expect(state.small).toEqual({ status: "complete", percent: 100 });
  });

  test("preserves progress when a transfer fails", () => {
    const state = modelTransferReducer(
      { small: { status: "downloading", percent: 42, file: "weights.bin" } },
      { type: "error", model: "small", message: "network" },
    );

    expect(state.small).toEqual({
      status: "error",
      message: "network",
      percent: 42,
    });
  });

  test("only resets a transfer that is still cancelled", () => {
    const cancelled = {
      small: { status: "cancelled" as const, percent: 0 },
    };
    expect(
      modelTransferReducer(cancelled, {
        type: "reset-cancelled",
        model: "small",
      }).small,
    ).toEqual({ status: "idle", percent: 0 });

    const restarted = {
      small: {
        status: "downloading" as const,
        percent: 1,
        file: "weights.bin",
      },
    };
    expect(
      modelTransferReducer(restarted, {
        type: "reset-cancelled",
        model: "small",
      }),
    ).toBe(restarted);
  });

  test("coordinates download events and deletion callbacks", async () => {
    const onModelDeleted = vi.fn();
    const { result } = renderTransferHook(onModelDeleted);

    await act(() => result.current.download("small", true));
    expect(mocks.downloadModel).toHaveBeenCalledWith("small", true);
    expect(result.current.downloadState.small?.status).toBe("downloading");

    const handlers = mocks.useEvents.mock.calls[0]?.[0] as
      ModelDownloadEventHandlers | undefined;
    act(() => handlers?.onComplete?.({ model: "small" }));
    expect(result.current.downloadState.small).toEqual({
      status: "complete",
      percent: 100,
    });

    await act(() => result.current.remove("small"));
    expect(mocks.deleteModel).toHaveBeenCalledWith("small");
    expect(onModelDeleted).toHaveBeenCalledWith("small");
    expect(result.current.downloadState.small).toEqual({
      status: "idle",
      percent: 0,
    });
  });
});

function renderTransferHook(onModelDeleted: (model: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    () => useModelTransfers({ enabled: true, onModelDeleted }),
    { wrapper },
  );
}
