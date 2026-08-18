// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import WorkspacePage from "./WorkspacePage";

describe("WorkspacePage", () => {
  test("keeps the header outside the content region", () => {
    render(
      <WorkspacePage
        header={<h1>Library</h1>}
        className="page-shell"
        contentClassName="content-scroll"
      >
        <p>Meeting list</p>
      </WorkspacePage>,
    );

    const page = screen.getByRole("heading", { name: "Library" }).closest(
      "section",
    );
    expect(page?.className).toContain("page-shell");
    expect(screen.getByText("Meeting list").parentElement?.className).toContain(
      "content-scroll",
    );
  });
});
