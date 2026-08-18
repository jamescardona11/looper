import { describe, expect, test, vi } from "vitest";
import { createAneCompileStore } from "./ane-compile-store";
import type { AneCompileEvent } from "../../types";

describe("ANE compile store", () => {
  test("publishes start and finish events through one native subscription", async () => {
    let emit: ((payload: AneCompileEvent) => void) | undefined;
    const stopNative = vi.fn();
    const dependencies = {
      subscribe: vi.fn(async (listener: (payload: AneCompileEvent) => void) => {
        emit = listener;
        return stopNative;
      }),
    };
    const store = createAneCompileStore(dependencies);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await Promise.resolve();

    emit?.({ status: "start", model: "parakeet", label: "Parakeet" });
    expect(store.getSnapshot()).toBe("Parakeet");
    emit?.({ status: "done", model: "parakeet", label: "Parakeet" });
    expect(store.getSnapshot()).toBeNull();

    unsubscribe();
    expect(stopNative).toHaveBeenCalledOnce();
  });

  test("cleans a subscription that resolves after the overlay unmounts", async () => {
    const stopNative = vi.fn();
    let finishSubscription: ((cleanup: () => void) => void) | undefined;
    const store = createAneCompileStore({
      subscribe: () =>
        new Promise((resolve) => {
          finishSubscription = resolve;
        }),
    });

    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
    finishSubscription?.(stopNative);
    await Promise.resolve();

    expect(stopNative).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toBeNull();
  });
});
