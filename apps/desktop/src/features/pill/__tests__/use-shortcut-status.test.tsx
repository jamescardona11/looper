// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { refreshShortcutStatus } from "../../../data/capture/shortcuts";
import { useShortcutStatus } from "../use-shortcut-status";
vi.mock("../../../data/capture/shortcuts", () => ({
  refreshShortcutStatus: vi.fn(),
}));
const refresh = vi.mocked(refreshShortcutStatus);
beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("detects missing permission, recovery and later revocation without focus", async () => {
  refresh
    .mockResolvedValueOnce("accessibility_required")
    .mockResolvedValueOnce("ready")
    .mockResolvedValue("accessibility_required");
  const { result } = renderHook(useShortcutStatus);
  expect(result.current).toBe("checking");
  await act(async () => {});
  expect(result.current).toBe("accessibility_required");
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(result.current).toBe("ready");
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(result.current).toBe("accessibility_required");
});

test("fails visibly when the native listener cannot be checked and retries", async () => {
  refresh
    .mockRejectedValueOnce(new Error("listener unavailable"))
    .mockResolvedValue("ready");
  const { result } = renderHook(useShortcutStatus);
  await act(async () => {});
  expect(result.current).toBe("unavailable");
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(result.current).toBe("ready");
});

test("does not overlap native checks or schedule work after unmount", async () => {
  let resolve!: (value: "ready") => void;
  refresh.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { unmount } = renderHook(useShortcutStatus);
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(refresh).toHaveBeenCalledOnce();
  unmount();
  await act(async () => {
    resolve("ready");
  });
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(refresh).toHaveBeenCalledOnce();
});
