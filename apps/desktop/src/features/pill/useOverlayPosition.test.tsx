// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useOverlayPosition } from "./useOverlayPosition";

const overlayActions = vi.hoisted(() => ({
  persist: vi.fn(),
  restore: vi.fn(),
}));
const windowEvents = vi.hoisted(() => ({
  moved: undefined as
    ((event: { payload: { x: number; y: number } }) => void) | undefined,
  dispose: vi.fn(),
}));

vi.mock("../../data/overlay", () => ({
  OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT: "looper:overlay-automatic-move",
  persistOverlayPosition: overlayActions.persist,
  setOverlayPosition: overlayActions.restore,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onMoved: (
      listener: (event: { payload: { x: number; y: number } }) => void,
    ) => {
      windowEvents.moved = listener;
      return Promise.resolve(windowEvents.dispose);
    },
  }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  overlayActions.persist.mockReset();
  overlayActions.restore.mockReset();
  windowEvents.dispose.mockReset();
  windowEvents.moved = undefined;
  vi.useRealTimers();
});

describe("useOverlayPosition", () => {
  test("persists a user drag without repositioning the native window", async () => {
    vi.useFakeTimers();
    overlayActions.persist.mockResolvedValue({ x: 2_100, y: 24 });

    renderHook(() => useOverlayPosition(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(windowEvents.moved).toBeTypeOf("function");

    const dragRegion = document.createElement("div");
    dragRegion.dataset.tauriDragRegion = "true";
    document.body.append(dragRegion);
    fireEvent.pointerDown(dragRegion);

    act(() => {
      windowEvents.moved?.({ payload: { x: 2_100, y: 24 } });
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(overlayActions.persist).toHaveBeenCalledWith({
      x: 2_100,
      y: 24,
    });

    expect(overlayActions.restore).not.toHaveBeenCalled();
  });

  test("persists a drag started from the compact pill handle", async () => {
    vi.useFakeTimers();
    overlayActions.persist.mockResolvedValue({ x: 1_900, y: 32 });

    renderHook(() => useOverlayPosition(true));
    await act(async () => {
      await Promise.resolve();
    });

    const compactHandle = document.createElement("button");
    compactHandle.dataset.overlayDragHandle = "true";
    document.body.append(compactHandle);
    fireEvent.pointerDown(compactHandle);

    act(() => {
      windowEvents.moved?.({ payload: { x: 1_900, y: 32 } });
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(overlayActions.persist).toHaveBeenCalledWith({ x: 1_900, y: 32 });
  });

  test("does not persist a programmatic overlay move", async () => {
    vi.useFakeTimers();
    overlayActions.persist.mockResolvedValue({ x: 2_100, y: 24 });
    renderHook(() => useOverlayPosition(true));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      windowEvents.moved?.({ payload: { x: 2_100, y: 24 } });
      vi.advanceTimersByTime(120);
    });

    expect(overlayActions.persist).not.toHaveBeenCalled();
  });

  test("does not persist the automatic reposition after a compact-pill click", async () => {
    vi.useFakeTimers();
    overlayActions.persist.mockResolvedValue({ x: 2_100, y: 24 });
    renderHook(() => useOverlayPosition(true));
    await act(async () => {
      await Promise.resolve();
    });

    const compactHandle = document.createElement("button");
    compactHandle.dataset.overlayDragHandle = "true";
    document.body.append(compactHandle);
    fireEvent.pointerDown(compactHandle, {
      clientX: 12,
      clientY: 12,
      pointerId: 1,
    });
    window.dispatchEvent(new Event("looper:overlay-automatic-move"));

    act(() => {
      windowEvents.moved?.({ payload: { x: 2_100, y: 24 } });
      vi.advanceTimersByTime(120);
    });

    expect(overlayActions.persist).not.toHaveBeenCalled();
  });

  test("does not restore the automatic-position storage version", async () => {
    overlayActions.restore.mockResolvedValue({ x: 2_100, y: 24 });
    localStorage.setItem(
      "looper:overlay-position:v4",
      JSON.stringify({ x: 2_100, y: 24 }),
    );

    renderHook(() => useOverlayPosition(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(overlayActions.restore).not.toHaveBeenCalled();
  });
});
