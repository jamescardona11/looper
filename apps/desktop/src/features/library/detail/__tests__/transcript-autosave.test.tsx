// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useTranscriptAutosave } from "../library-detail-transcript-autosave";
import type { LibraryDetailProps } from "../library-detail-types";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(onUpdate: LibraryDetailProps["onUpdate"]) {
  return renderHook(() => {
    const [value, setValue] = useState("original");
    return {
      value,
      ...useTranscriptAutosave({
        source: "original",
        value,
        setValue,
        available: true,
        onUpdate,
      }),
    };
  });
}
test("retains failed edits and retries the latest draft", async () => {
  vi.useFakeTimers();
  const update = vi
    .fn()
    .mockRejectedValueOnce(new Error("disk unavailable"))
    .mockResolvedValue({});
  const { result } = setup(update);
  act(() => result.current.change("edited"));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(result.current.value).toBe("edited");
  expect(result.current.status).toBe("error");
  await act(() => result.current.save());
  expect(update).toHaveBeenLastCalledWith({ transcript: "edited" });
  expect(result.current.status).toBe("saved");
});
test("serializes writes and saves the newest edit after an in-flight save", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const update = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({});
  const { result } = setup(update);
  act(() => result.current.change("first"));
  await act(() => vi.advanceTimersByTimeAsync(600));
  act(() => result.current.change("second"));
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({});
  });
  expect(update).toHaveBeenLastCalledWith({ transcript: "second" });
  expect(result.current.value).toBe("second");
  expect(result.current.status).toBe("saved");
});
