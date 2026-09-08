// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useOverlayPosition } from "../useOverlayPosition";

const native = vi.hoisted(() => ({
  restore: vi.fn(),
  subscribe: vi.fn(),
  dispose: vi.fn(),
  position: undefined as
    ((position: { x: number; y: number }) => void) | undefined,
}));
vi.mock("../../../data/capture/overlay", () => ({
  setOverlayPosition: native.restore,
  subscribeOverlayPosition: native.subscribe,
}));
const key = "looper:overlay-position:v5";
beforeEach(() => {
  native.subscribe.mockImplementation((handler) => {
    native.position = handler;
    return Promise.resolve(native.dispose);
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
  native.position = undefined;
});

test("stores the native final anchor without moving the window again", async () => {
  renderHook(() => useOverlayPosition());
  await act(async () => {});
  native.position?.({ x: 2100, y: 24 });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ x: 2100, y: 24 });
  expect(native.restore).not.toHaveBeenCalled();
});

test("keeps the latest release even when the previous drag took over ten seconds", async () => {
  renderHook(() => useOverlayPosition());
  await act(async () => {});
  native.position?.({ x: 150, y: 40 });
  native.position?.({ x: 3000, y: 120 });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ x: 3000, y: 120 });
});

test("restores the saved anchor and remembers its native correction", async () => {
  localStorage.setItem(key, JSON.stringify({ x: 2000, y: 10 }));
  native.restore.mockResolvedValue({ x: 1800, y: 10 });
  renderHook(() => useOverlayPosition());
  await act(async () => {});
  expect(native.restore).toHaveBeenCalledWith({ x: 2000, y: 10 });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ x: 1800, y: 10 });
});

test("does not overwrite a new drag when restoration resolves late", async () => {
  localStorage.setItem(key, JSON.stringify({ x: 100, y: 10 }));
  let finish!: (position: { x: number; y: number }) => void;
  native.restore.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  renderHook(() => useOverlayPosition());
  await act(async () => {});
  native.position?.({ x: 300, y: 40 });
  await act(async () => {
    finish({ x: 100, y: 10 });
  });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ x: 300, y: 40 });
});

test("ignores the hidden window sentinel", async () => {
  renderHook(() => useOverlayPosition());
  await act(async () => {});
  native.position?.({ x: -10000, y: -10000 });
  expect(localStorage.getItem(key)).toBeNull();
});

test("disposes a listener that arrives after unmount", async () => {
  let finish!: (dispose: () => void) => void;
  native.subscribe.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const view = renderHook(() => useOverlayPosition());
  view.unmount();
  await act(async () => {
    finish(native.dispose);
  });
  expect(native.dispose).toHaveBeenCalledOnce();
});
