// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TranscriptWords } from "./TranscriptWords";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("transcript word rendering", () => {
  test("keeps token spacing, active markers, and measured underline geometry", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(10);
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(4);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(26);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(30);

    const { container } = render(
      <TranscriptWords tokens={["Hello", "world"]} activePosition={1} />,
    );
    const root = container.firstElementChild as HTMLSpanElement;
    const words = root.querySelectorAll(".transcript-word");
    const underline = root.querySelector(
      ".transcript-word-underline",
    ) as HTMLSpanElement;

    expect(root.className).toBe("transcript-words select-text");
    expect(root.textContent).toBe("Hello world");
    expect(words).toHaveLength(2);
    expect(words[0].outerHTML).toBe(
      '<span class="transcript-word">Hello</span>',
    );
    expect(words[1].outerHTML).toBe(
      '<span data-word-active="true" class="transcript-word transcript-word-active">world</span>',
    );
    expect(underline.getAttribute("aria-hidden")).toBe("true");
    expect(underline.getAttribute("style")).toBe(
      "transform: translate(10px, 28px); width: 30px; opacity: 1;",
    );
  });

  test("retains the previous geometry while hiding an inactive underline", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(7);
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(3);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(25);
    const { container, rerender } = render(
      <TranscriptWords tokens={["One", "two"]} activePosition={0} />,
    );

    rerender(<TranscriptWords tokens={["One", "two"]} activePosition={-1} />);

    const underline = container.querySelector(
      ".transcript-word-underline",
    ) as HTMLSpanElement;
    expect(container.querySelector('[data-word-active="true"]')).toBeNull();
    expect(underline.getAttribute("style")).toBe(
      "transform: translate(7px, 21px); width: 25px; opacity: 0;",
    );
  });
});
