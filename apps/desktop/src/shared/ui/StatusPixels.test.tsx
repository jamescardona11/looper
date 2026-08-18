// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ActivityDots from "./ActivityDots";
import DotMatrix from "./DotMatrix";
import { IntelligencePixel } from "./IntelligencePixel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dotOpacities(matrix: Element) {
  return Array.from(
    matrix.children,
    (dot) => (dot as HTMLElement).style.opacity,
  );
}

describe("status pixels", () => {
  test("renders a matrix with the requested geometry and active cells", () => {
    const { container } = render(
      <DotMatrix
        rows={2}
        cols={3}
        activeDots={[1, 4]}
        dotSize={5}
        gap={2}
        color="tomato"
        className="signal-grid"
      />,
    );
    const matrix = container.firstElementChild as HTMLElement;

    expect(matrix.children).toHaveLength(6);
    expect(matrix.className).toContain("signal-grid");
    expect(matrix.style.gridTemplateColumns).toBe("repeat(3, 5px)");
    expect(matrix.style.gap).toBe("2px");
    expect(dotOpacities(matrix)).toEqual([
      "0.15",
      "1",
      "0.15",
      "0.15",
      "1",
      "0.15",
    ]);
  });

  test("advances the activity pattern on the configured clock", () => {
    vi.useFakeTimers();
    const { container } = render(<ActivityDots intervalMs={100} />);
    const matrix = container.firstElementChild as HTMLElement;

    expect(dotOpacities(matrix)).toEqual(["1", "0.15", "0.15", "1"]);
    act(() => vi.advanceTimersByTime(100));
    expect(dotOpacities(matrix)).toEqual(["0.15", "1", "1", "0.15"]);
  });

  test("keeps the intelligence indicator geometry and state colors", () => {
    const { container, rerender } = render(
      <IntelligencePixel active={false} statusType="complete" size="md" />,
    );
    const indicator = container.firstElementChild as HTMLElement;

    expect(indicator.className).toContain("w-[20px]");
    expect(indicator.children).toHaveLength(4);
    expect((indicator.firstElementChild as HTMLElement).className).toContain(
      "bg-[var(--color-text-muted)]",
    );

    rerender(<IntelligencePixel active statusType="error" size="md" />);
    expect((indicator.firstElementChild as HTMLElement).className).toContain(
      "bg-[var(--color-error)]",
    );
  });
});
