// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import {
  calculateMicrophoneLevel,
  createMicrophoneTestStore,
  getSelectedMicrophoneName,
  microphoneError,
  smoothMicrophoneLevels,
} from "../microphone-test-store";

describe("microphone test store", () => {
  test("resolves the selected native device label", () => {
    expect(
      getSelectedMicrophoneName(
        [
          { id: "built-in", name: "MacBook Microphone", is_default: true },
          { id: "usb", name: "USB Microphone", is_default: false },
        ],
        "usb",
      ),
    ).toBe("USB Microphone");
    expect(getSelectedMicrophoneName([], null)).toBeNull();
  });

  test("normalizes signal energy and smooths attack faster than release", () => {
    expect(calculateMicrophoneLevel(new Uint8Array(16).fill(128))).toBe(0);
    expect(calculateMicrophoneLevel(new Uint8Array(16).fill(255))).toBe(1);
    expect(
      smoothMicrophoneLevels({ left: 0, right: 1 }, { left: 1, right: 0 }),
    ).toEqual({ left: 0.78, right: 0.6799999999999999 });
  });

  test("publishes unsupported environments and resets on disposal", async () => {
    const store = createMicrophoneTestStore([], null, {
      mediaDevices: undefined,
      AudioContext: undefined,
      requestFrame: vi.fn(),
      cancelFrame: vi.fn(),
    });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    await store.start();
    expect(store.getSnapshot()).toMatchObject({
      status: "error",
      error: "unsupported",
    });
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    expect(store.getSnapshot()).toMatchObject({ status: "idle", error: null });
  });

  test("maps browser media failures without exposing platform errors", () => {
    expect(microphoneError(new DOMException("denied", "NotAllowedError"))).toBe(
      "permission-denied",
    );
    expect(microphoneError(new DOMException("missing", "NotFoundError"))).toBe(
      "not-found",
    );
    expect(microphoneError(new DOMException("busy", "NotReadableError"))).toBe(
      "busy",
    );
    expect(microphoneError(new Error("unknown"))).toBe("start-failed");
  });
});
