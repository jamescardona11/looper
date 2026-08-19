// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { LooperLogo, LooperWordmark } from "./LooperLogo";

afterEach(cleanup);

describe("LooperLogo", () => {
  test("exposes the product mark with the selected dimensions", () => {
    const { rerender } = render(<LooperLogo size="sm" />);
    const logo = screen.getByRole("img", { name: "Looper" });

    expect(logo.style.width).toBe("16px");
    expect(logo.style.height).toBe("16px");
    expect(logo.style.maskImage).toContain("svg");

    rerender(<LooperLogo size="xl" />);
    expect(logo.style.width).toBe("52px");
    expect(logo.style.height).toBe("52px");
  });

  test("exposes the product wordmark as an SVG asset mask", () => {
    render(<LooperWordmark />);
    const wordmark = screen.getByRole("img", { name: "Looper" });

    expect(wordmark.style.maskImage).toContain("svg");
  });
});
