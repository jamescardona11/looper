// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import WorkspaceRoute from "../WorkspaceRoute";

afterEach(cleanup);

describe("WorkspaceRoute", () => {
  test("keeps inactive view state mounted without exposing its controls", () => {
    const { container } = render(
      <WorkspaceRoute active={false}>
        <button type="button">Hidden action</button>
      </WorkspaceRoute>,
    );

    expect(screen.queryByRole("button", { name: "Hidden action" })).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe(
      "Hidden action",
    );
    expect(container.firstElementChild).toHaveProperty("hidden", true);
  });

  test("uses the shared reading width by default", () => {
    const { container } = render(
      <WorkspaceRoute active>
        <p>Visible content</p>
      </WorkspaceRoute>,
    );

    expect(screen.getByText("Visible content")).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("max-w-[1040px]");
  });

  test("keeps an explicit full-width escape hatch for meeting detail", () => {
    const { container } = render(
      <WorkspaceRoute active width="full">
        <p>Meeting detail</p>
      </WorkspaceRoute>,
    );

    expect(container.firstElementChild?.className).toContain("max-w-none");
  });
});
