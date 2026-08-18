// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import TranscriptText from "./TranscriptText";

afterEach(cleanup);

describe("TranscriptText", () => {
  test("renders the supported transcript formatting", () => {
    const { container } = render(
      <TranscriptText
        text={
          "**Important** and _emphasis_\nnext line\n\n- first\n- second\n\n`code`"
        }
      />,
    );

    expect(screen.getByText("Important").tagName).toBe("STRONG");
    expect(screen.getByText("emphasis").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("br")).toBeTruthy();
  });

  test("does not interpret raw HTML from transcript content", () => {
    const { container } = render(
      <TranscriptText
        text={
          'before <img src="x" onerror="alert(1)"> <script>alert(2)</script> after'
        }
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.textContent).toContain("alert(2)");
  });
});
