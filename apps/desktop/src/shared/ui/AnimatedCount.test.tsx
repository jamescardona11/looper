// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import AnimatedCount from "./AnimatedCount";

beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(cleanup);

describe("AnimatedCount", () => {
  test("exposes the formatted value to screen readers", () => {
    render(<AnimatedCount value={1234} />);
    expect(
      screen.getByText((1234).toLocaleString(), { selector: ".sr-only" }),
    ).toBeTruthy();
  });

  test("updates the accessible value when the number changes", () => {
    const { rerender } = render(<AnimatedCount value={41} />);
    rerender(<AnimatedCount value={42} />);
    expect(screen.getByText("42", { selector: ".sr-only" })).toBeTruthy();
  });

  test("supports a custom formatter", () => {
    render(
      <AnimatedCount
        value={65}
        format={(value) =>
          `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
        }
      />,
    );
    expect(screen.getByText("01:05", { selector: ".sr-only" })).toBeTruthy();
  });
});
