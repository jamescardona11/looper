// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSpeechPlayback } from "./useSpeechPlayback";

class TestUtterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

const synthesis = {
  cancel: vi.fn(),
  speak: vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: synthesis,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", TestUtterance);
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
});

describe("useSpeechPlayback", () => {
  test("speaks the text with the resolved language and clears state on end", () => {
    const { result } = renderHook(() =>
      useSpeechPlayback("Meeting complete.", "Spanish"),
    );

    act(() => result.current.speak());
    expect(result.current.supported).toBe(true);
    expect(result.current.isSpeaking).toBe(true);
    const utterance = synthesis.speak.mock.calls[0]?.[0] as TestUtterance;
    expect(utterance.text).toBe("Meeting complete.");
    expect(utterance.lang).toBe("es");

    act(() => utterance.onend?.());
    expect(result.current.isSpeaking).toBe(false);
  });

  test("cancels playback on demand and when the source text changes", () => {
    const { result, rerender } = renderHook(
      ({ text }) => useSpeechPlayback(text),
      { initialProps: { text: "First" } },
    );

    act(() => result.current.speak());
    act(() => result.current.stop());
    expect(result.current.isSpeaking).toBe(false);

    act(() => result.current.speak());
    rerender({ text: "Second" });
    expect(result.current.isSpeaking).toBe(false);
    expect(synthesis.cancel).toHaveBeenCalled();
  });
});
