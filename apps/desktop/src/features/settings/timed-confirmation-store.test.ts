import { afterEach, describe, expect, test, vi } from "vitest";
import { createTimedConfirmationStore } from "./timed-confirmation-store";

afterEach(() => vi.useRealTimers());

describe("timed confirmation store", () => {
  test("requires a second request inside the confirmation window", () => {
    vi.useFakeTimers();
    const store = createTimedConfirmationStore(3_000);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.request()).toBe(false);
    expect(store.getSnapshot()).toBe(true);
    expect(store.request()).toBe(true);
    expect(store.getSnapshot()).toBe(false);
    unsubscribe();
  });

  test("expires automatically and clears its timer on disposal", () => {
    vi.useFakeTimers();
    const store = createTimedConfirmationStore(3_000);
    const unsubscribe = store.subscribe(vi.fn());
    store.request();
    vi.advanceTimersByTime(3_000);
    expect(store.getSnapshot()).toBe(false);

    store.request();
    unsubscribe();
    expect(store.getSnapshot()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
