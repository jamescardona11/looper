import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "../use-reduced-motion";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useReducedMotion", () => {
  it("reads the current preference and reacts to changes", () => {
    let matches = true;
    const listeners = new Set<() => void>();

    window.matchMedia = vi.fn(
      () =>
        ({
          get matches() {
            return matches;
          },
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addEventListener: (_type: string, listener: () => void) => {
            listeners.add(listener);
          },
          removeEventListener: (_type: string, listener: () => void) => {
            listeners.delete(listener);
          },
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      matches = false;
      for (const listener of listeners) listener();
    });

    expect(result.current).toBe(false);
  });
});
