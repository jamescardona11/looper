// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { LooperLogo } from "./LooperLogo";

afterEach(cleanup);

describe("LooperLogo", () => {
  test("exposes the product mark with the selected dimensions", () => {
    const { rerender } = render(<LooperLogo size="sm" />);
    const logo = screen.getByRole("img", { name: "Looper" });

    expect(logo.getAttribute("width")).toBe("16");
    expect(logo.getAttribute("height")).toBe("16");
    expect(logo.querySelectorAll("path, rect")).toHaveLength(2);

    rerender(<LooperLogo size="xl" />);
    expect(logo.getAttribute("width")).toBe("52");
    expect(logo.getAttribute("height")).toBe("52");
  });
});
