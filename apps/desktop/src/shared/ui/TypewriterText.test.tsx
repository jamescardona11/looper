// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { estimateTypewriterMs, TypewriterText } from "./TypewriterText";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TypewriterText", () => {
  test("reveals characters after the initial delay at the configured speed", () => {
    vi.useFakeTimers();
    const { container } = render(
      <TypewriterText
        text="Loop"
        speedMs={20}
        delayMs={50}
        as="p"
        className="typed"
      />,
    );
    const output = container.firstElementChild as HTMLElement;

    expect(output.tagName).toBe("P");
    expect(output.className).toBe("typed");
    expect(output.textContent).toBe("");
    act(() => vi.advanceTimersByTime(49));
    expect(output.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(output.textContent).toBe("L");
    act(() => vi.advanceTimersByTime(40));
    expect(output.textContent).toBe("Loo");
  });

  test("shows the complete value when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<TypewriterText text="Looper" />);

    expect(container.textContent).toBe("Looper");
  });

  test("estimates the full animation duration", () => {
    expect(estimateTypewriterMs("Loop", 20, 50)).toBe(130);
  });
});
