// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { usePillState } from "../usePillState";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  sync: vi.fn(() => Promise.resolve()),
  audioHandler: undefined as
    ((payload: { bins: number[] }) => void) | undefined,
  transformHandler: undefined as
    ((payload: { text: string }) => void) | undefined,
  releaseAudio: vi.fn(),
  releaseTransform: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      mocks.listeners.set(event, handler);
      return () => mocks.listeners.delete(event);
    },
  ),
}));

vi.mock("../../../data/audio", () => ({
  subscribeAudioSpectrum: vi.fn(
    async (handler: (payload: { bins: number[] }) => void) => {
      mocks.audioHandler = handler;
      return mocks.releaseAudio;
    },
  ),
}));

vi.mock("../../../data/transcription", () => ({
  subscribeTransformStream: vi.fn(
    async (handler: (payload: { text: string }) => void) => {
      mocks.transformHandler = handler;
      return mocks.releaseTransform;
    },
  ),
}));

vi.mock("../../../data/dictation", () => ({
  syncPillRendererState: mocks.sync,
}));

afterEach(() => {
  cleanup();
  mocks.listeners.clear();
  mocks.sync.mockClear();
  mocks.audioHandler = undefined;
  mocks.transformHandler = undefined;
  mocks.releaseAudio.mockClear();
  mocks.releaseTransform.mockClear();
  vi.useRealTimers();
});

function emit(channel: string, payload: unknown) {
  act(() => mocks.listeners.get(channel)?.({ payload }));
}

async function renderPillState() {
  const view = renderHook(() => usePillState());
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
  return view;
}

describe("usePillState", () => {
  test("requests the native snapshot only after every pill listener is ready", async () => {
    const { result } = await renderPillState();
    expect(mocks.listeners.has("pill:state")).toBe(true);
    expect(mocks.listeners.has("pill:error")).toBe(true);
    expect(mocks.listeners.has("pill:inserted")).toBe(true);
    expect(mocks.listeners.has("pill:mode")).toBe(true);
    expect(mocks.listeners.has("pill:hover")).toBe(true);

    emit("pill:state", { status: "listening" });
    emit("pill:hover", { hovering: true });

    expect(result.current.pillStatus).toBe("listening");
    expect(result.current.isHovered).toBe(true);
  });

  test("accepts final and streaming text only while capture is active", async () => {
    const { result } = await renderPillState();

    emit("pill:mode", {
      expanded: true,
      text: "ignored while idle",
      tone: "preview",
      usedScreenContext: true,
    });
    expect(result.current.isExpanded).toBe(false);

    emit("pill:state", { status: "processing" });
    emit("pill:mode", {
      expanded: true,
      text: "Final transcript",
      tone: "preview",
      usedScreenContext: true,
    });
    expect(result.current.expandedText).toBe("Final transcript");
    expect(result.current.pillTone).toBe("preview");
    expect(result.current.usedScreenContext).toBe(true);

    act(() => mocks.transformHandler?.({ text: "Partial rewrite" }));
    expect(result.current.expandedText).toBe("Partial rewrite");
    expect(result.current.pillTone).toBe("preview");

    emit("pill:state", { status: "idle" });
    expect(result.current.isExpanded).toBe(false);
    expect(result.current.expandedText).toBe("");
    expect(result.current.pillTone).toBe("default");
    expect(result.current.usedScreenContext).toBe(false);
  });

  test("keeps insertion confirmation for four seconds and supports manual dismissal", async () => {
    const { result } = await renderPillState();
    vi.useFakeTimers();

    emit("pill:inserted", { chars: 0, can_undo: true });
    expect(result.current.inserted).toBeNull();

    emit("pill:inserted", { chars: 42, can_undo: true });
    expect(result.current.inserted).toEqual({ chars: 42, canUndo: true });
    act(() => vi.advanceTimersByTime(3_999));
    expect(result.current.inserted).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.inserted).toBeNull();

    emit("pill:inserted", { chars: 7, can_undo: false });
    act(() => result.current.dismissInserted());
    expect(result.current.inserted).toBeNull();
  });

  test("restarts the error flash and invalidates retry on the next status", async () => {
    const { result } = await renderPillState();
    vi.useFakeTimers();

    emit("pill:error", { retry_id: "retry-7" });
    emit("pill:state", { status: "error" });
    expect(result.current.retryId).toBe("retry-7");
    expect(result.current.isErrorFlashing).toBe(true);

    act(() => vi.advanceTimersByTime(1_000));
    emit("pill:state", { status: "error" });
    act(() => vi.advanceTimersByTime(1_199));
    expect(result.current.isErrorFlashing).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.isErrorFlashing).toBe(false);

    emit("pill:state", { status: "listening" });
    expect(result.current.retryId).toBeNull();
  });

  test("updates spectrum only while listening and clears it on cancellation", async () => {
    const { result } = await renderPillState();
    const now = vi.spyOn(performance, "now").mockReturnValue(321);

    act(() => mocks.audioHandler?.({ bins: [9, 8] }));
    expect(result.current.spectrumBinsRef.current).toHaveLength(256);
    expect(result.current.lastSpectrumAtRef.current).toBe(0);

    emit("pill:state", { status: "listening" });
    act(() => mocks.audioHandler?.({ bins: [9, 8] }));
    expect([...result.current.spectrumBinsRef.current]).toEqual([9, 8]);
    expect(result.current.lastSpectrumAtRef.current).toBe(321);

    emit("pill:state", { status: "cancelled" });
    expect([...result.current.spectrumBinsRef.current]).toEqual([0, 0]);
    expect(result.current.lastSpectrumAtRef.current).toBe(0);
    now.mockRestore();
  });

  test("releases native and stream listeners on unmount", async () => {
    const { unmount } = await renderPillState();

    unmount();

    expect(mocks.listeners.size).toBe(0);
    expect(mocks.releaseAudio).toHaveBeenCalledOnce();
    expect(mocks.releaseTransform).toHaveBeenCalledOnce();
  });
});
