// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useModelDownloadEvents } from "../useModelDownloadEvents";

const bridge = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unlisten: vi.fn(),
  handlers: undefined as
    | {
        onComplete?: (payload: { model: string }) => void;
      }
    | undefined,
}));

vi.mock("../../../data/models/model-downloads", () => ({
  subscribeModelDownloadEvents: bridge.subscribe,
}));

beforeEach(() => {
  bridge.handlers = undefined;
  bridge.unlisten.mockReset();
  bridge.subscribe.mockImplementation((handlers) => {
    bridge.handlers = handlers;
    return [Promise.resolve(bridge.unlisten)];
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useModelDownloadEvents", () => {
  test("keeps one subscription and routes events to the latest enabled handler", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ enabled, handler }) =>
        useModelDownloadEvents({ enabled, onComplete: handler }),
      { initialProps: { enabled: false, handler: first } },
    );

    act(() => bridge.handlers?.onComplete?.({ model: "parakeet" }));
    expect(first).not.toHaveBeenCalled();

    rerender({ enabled: true, handler: second });
    act(() => bridge.handlers?.onComplete?.({ model: "parakeet" }));
    expect(second).toHaveBeenCalledWith({ model: "parakeet" });
    expect(bridge.subscribe).toHaveBeenCalledOnce();
    await act(async () => Promise.resolve());
    unmount();
    expect(bridge.unlisten).toHaveBeenCalledOnce();
  });
});
