// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useQueuedPersist } from "./useQueuedPersist";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

describe("useQueuedPersist", () => {
  test("persists one value at a time and publishes only the latest result", async () => {
    const firstWrite = deferred<string[]>();
    const persist = vi
      .fn<(next: string[]) => Promise<string[]>>()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce(["second-clean"]);
    const setValue = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() => {
      const [value, updateValue] = useState(["base"]);
      return useQueuedPersist({
        value,
        persist,
        setError,
        setValue: (next) => {
          setValue(next);
          updateValue(next);
        },
      });
    });

    let activeWrite!: Promise<void>;
    act(() => {
      activeWrite = result.current.persistNext(["first"]);
    });
    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      await result.current.persistNext(["second"]);
    });
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstWrite.resolve(["first-clean"]);
      await activeWrite;
    });

    expect(persist).toHaveBeenNthCalledWith(1, ["first"]);
    expect(persist).toHaveBeenNthCalledWith(2, ["second"]);
    expect(setValue.mock.calls.map(([value]) => value)).toEqual([
      ["first"],
      ["second"],
      ["second-clean"],
    ]);
    expect(result.current.currentRef.current).toEqual(["second-clean"]);
    expect(result.current.pending).toBe(false);
  });

  test("restores the last durable value when persistence fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const persist = vi.fn().mockRejectedValue(new Error("disk full"));
    const setValue = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() => {
      const [value, updateValue] = useState(["durable"]);
      return useQueuedPersist({
        value,
        persist,
        setError,
        setValue: (next) => {
          setValue(next);
          updateValue(next);
        },
      });
    });

    await act(async () => {
      await result.current.persistNext(["optimistic"]);
    });

    expect(setValue.mock.calls.map(([value]) => value)).toEqual([
      ["optimistic"],
      ["durable"],
    ]);
    expect(setError).toHaveBeenLastCalledWith("disk full");
    expect(result.current.currentRef.current).toEqual(["durable"]);
    expect(result.current.pending).toBe(false);
  });
});
