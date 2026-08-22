// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import ScreenHeader from "../ScreenHeader";
import SectionLabel from "../SectionLabel";

afterEach(cleanup);

describe("shared headings", () => {
  test("composes a section label with optional accessories and divider", () => {
    const { container } = render(
      <SectionLabel
        icon={<span data-testid="label-icon">I</span>}
        trailing={<button type="button">Add</button>}
        className="custom-label"
      >
        Vocabulary
      </SectionLabel>,
    );

    expect(screen.getByRole("heading", { name: "Vocabulary" })).toBeTruthy();
    expect(screen.getByTestId("label-icon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("custom-label");
    expect(container.querySelector(".ui-divider-trailing")).toBeTruthy();
  });

  test("keeps title context and trailing action in a screen header", () => {
    const { container } = render(
      <ScreenHeader
        icon={<span data-testid="screen-icon">L</span>}
        title="Library"
        description="Review captured meetings"
        titleAdornment={<span>Beta</span>}
        trailing={<button type="button">Import</button>}
        className="custom-header"
      />,
    );

    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    expect(screen.getByText("Review captured meetings").tagName).toBe("P");
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("custom-header");
  });
});
