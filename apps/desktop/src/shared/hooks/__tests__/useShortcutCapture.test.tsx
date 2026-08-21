// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useShortcutCapture } from "../useShortcutCapture";

const nativeCapture = vi.hoisted(() => ({
  subscribe: vi.fn(),
  handler: undefined as
    | ((
        payload:
          | { kind: "preview"; shortcut: string }
          | { kind: "captured"; shortcut: string }
          | { kind: "error"; message: string },
      ) => void)
    | undefined,
  unlisten: vi.fn(),
}));

vi.mock("../../../data/shortcuts", () => ({
  subscribeShortcutCapture: nativeCapture.subscribe,
}));

beforeEach(() => {
  nativeCapture.handler = undefined;
  nativeCapture.unlisten.mockReset();
  nativeCapture.subscribe.mockImplementation((handler) => {
    nativeCapture.handler = handler;
    return Promise.resolve(nativeCapture.unlisten);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useShortcutCapture", () => {
  test("subscribes only while active and completes a captured shortcut", async () => {
    const callbacks = {
      onCancel: vi.fn(() => Promise.resolve()),
      onPreviewChange: vi.fn(),
      onShortcutCaptured: vi.fn(),
      onCaptureInput: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ active }) => useShortcutCapture({ active, ...callbacks }),
      { initialProps: { active: false } },
    );
    expect(nativeCapture.subscribe).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(nativeCapture.subscribe).toHaveBeenCalledOnce();
    act(() =>
      nativeCapture.handler?.({ kind: "preview", shortcut: "Control+K" }),
    );
    expect(callbacks.onPreviewChange).toHaveBeenCalledWith("Ctrl + K");

    await act(async () => {
      nativeCapture.handler?.({ kind: "captured", shortcut: "Control+K" });
      await Promise.resolve();
    });
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(callbacks.onShortcutCaptured).toHaveBeenCalledWith("Control+K");
    expect(callbacks.onPreviewChange).toHaveBeenLastCalledWith("");
  });

  test("cancels an active capture on an unmodified Escape", async () => {
    const onCancel = vi.fn(() => Promise.resolve());
    const onCaptureCancelled = vi.fn();
    renderHook(() =>
      useShortcutCapture({
        active: true,
        onCancel,
        onPreviewChange: vi.fn(),
        onShortcutCaptured: vi.fn(),
        onCaptureCancelled,
      }),
    );

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      );
      await Promise.resolve();
    });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCaptureCancelled).toHaveBeenCalledOnce();
  });

  test("reports native errors, cancels, resets, and detaches once", async () => {
    const callbacks = {
      onCancel: vi.fn(() => Promise.resolve()),
      onPreviewChange: vi.fn(),
      onShortcutCaptured: vi.fn(),
      onCaptureCancelled: vi.fn(),
      onError: vi.fn(),
    };
    renderHook(() => useShortcutCapture({ active: true, ...callbacks }));
    await act(async () => Promise.resolve());

    await act(async () => {
      nativeCapture.handler?.({ kind: "error", message: "Native stopped" });
      await Promise.resolve();
    });

    expect(callbacks.onError).toHaveBeenCalledWith("Native stopped");
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(callbacks.onCaptureCancelled).toHaveBeenCalledOnce();
    expect(callbacks.onShortcutCaptured).not.toHaveBeenCalled();
    expect(callbacks.onPreviewChange).toHaveBeenLastCalledWith("");
    expect(nativeCapture.unlisten).toHaveBeenCalledOnce();
  });
});
