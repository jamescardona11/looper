// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RefObject } from "react";

const focusSource = vi.hoisted(() => ({
  callback: null as (() => void) | null,
  unlisten: vi.fn(),
  shouldThrow: false,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    if (focusSource.shouldThrow) throw new Error("Tauri is unavailable");
    return {
      onFocusChanged: vi.fn(async (callback: () => void) => {
        focusSource.callback = callback;
        return focusSource.unlisten;
      }),
    };
  },
}));

import { useClickOutside } from "./useClickOutside";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useDebouncedValue } from "./useDebouncedValue";
import { useShiftHeld } from "./useShiftHeld";

describe("shared interaction hooks", () => {
  beforeEach(() => {
    focusSource.callback = null;
    focusSource.unlisten.mockReset();
    focusSource.shouldThrow = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("publishes a changed value after the debounce period", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: "first" } },
    );

    rerender({ value: "second" });
    expect(result.current).toBe("first");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("second");
  });

  test("calls the latest callback only for clicks outside the element", () => {
    const container = document.createElement("div");
    const child = document.createElement("span");
    container.append(child);
    document.body.append(container);
    const ref = { current: container } as RefObject<HTMLDivElement>;
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ callback, enabled }) => useClickOutside(ref, callback, enabled),
      { initialProps: { callback: first, enabled: true } },
    );

    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(first).not.toHaveBeenCalled();

    rerender({ callback: second, enabled: true });
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();

    rerender({ callback: second, enabled: false });
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(second).toHaveBeenCalledOnce();
    unmount();
    container.remove();
  });

  test("copies text and clears the confirmation after the requested delay", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { result } = renderHook(() => useCopyToClipboard(200));

    await act(async () => {
      await expect(result.current.copy("Looper")).resolves.toBe(true);
    });
    expect(writeText).toHaveBeenCalledWith("Looper");
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.copied).toBe(false);
  });

  test("reports clipboard failures and lets callers cancel confirmation", async () => {
    vi.useFakeTimers();
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useCopyToClipboard(200));

    await act(async () => void (await result.current.copy("first")));
    act(() => result.current.reset());
    expect(result.current.copied).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      await expect(result.current.copy("second")).resolves.toBe(false);
    });
    expect(result.current.copied).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to copy:",
      expect.any(Error),
    );
  });

  test("tracks Shift globally and resets it when focus changes", async () => {
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useShiftHeld(enabled),
      { initialProps: { enabled: true } },
    );
    await act(async () => Promise.resolve());

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, shiftKey: true }),
      );
    });
    expect(result.current).toBe(true);

    rerender({ enabled: false });
    expect(result.current).toBe(false);
    rerender({ enabled: true });
    act(() => focusSource.callback?.());
    expect(result.current).toBe(false);

    unmount();
    expect(focusSource.unlisten).toHaveBeenCalledOnce();
  });

  test("tracks Shift when the native window bridge is unavailable", () => {
    focusSource.shouldThrow = true;
    const { result, unmount } = renderHook(() => useShiftHeld());

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, shiftKey: true }),
      );
    });
    expect(result.current).toBe(true);

    unmount();
  });
});
