// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Shimmer from "./Shimmer";

describe("Shimmer", () => {
  test("renders a decorative loading surface with caller dimensions", () => {
    const { container } = render(<Shimmer className="h-3 w-24" />);
    const shimmer = container.firstElementChild;

    expect(shimmer?.getAttribute("aria-hidden")).toBe("true");
    expect(shimmer?.className).toContain("looper-shimmer");
    expect(shimmer?.className).toContain("h-3 w-24");
  });
});
