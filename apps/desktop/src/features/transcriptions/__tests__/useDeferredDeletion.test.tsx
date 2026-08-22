// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDeferredDeletion } from "../useDeferredDeletion";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDeferredDeletion", () => {
  test("commits only after the undo window expires", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeferredDeletion(commit, 8_000));

    act(() => result.current.requestDeletion("dictation-1"));
    expect(result.current.pendingIds.has("dictation-1")).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(8_000));
    expect(commit).toHaveBeenCalledWith("dictation-1");
    expect(result.current.pendingIds.has("dictation-1")).toBe(false);
  });

  test("undo cancels the permanent deletion", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeferredDeletion(commit, 8_000));

    act(() => result.current.requestDeletion("dictation-1"));
    act(() => expect(result.current.undoDeletion("dictation-1")).toBe(true));
    act(() => vi.advanceTimersByTime(8_000));

    expect(commit).not.toHaveBeenCalled();
    expect(result.current.pendingIds.has("dictation-1")).toBe(false);
  });

  test("commits pending actions when navigation unmounts the view", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useDeferredDeletion(commit, 8_000),
    );

    act(() => result.current.requestDeletion("dictation-1"));
    unmount();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("dictation-1");
  });

  test("does not schedule the same record twice", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeferredDeletion(commit, 8_000));

    act(() => {
      result.current.requestDeletion("dictation-1");
      result.current.requestDeletion("dictation-1");
      vi.advanceTimersByTime(8_000);
    });

    expect(commit).toHaveBeenCalledTimes(1);
  });
});
