import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownContent } from "../markdown-content";

afterEach(cleanup);

describe("MarkdownContent", () => {
  it("preserves rich formatting in a recording summary", () => {
    render(
      <I18nProvider defaultLocale="en">
        <MarkdownContent
          content={
            "## Launch plan\n\n- Draft the brief\n- Review metrics\n\n```ts\nconst ready = true;\n```"
          }
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Launch plan" })).toBeVisible();
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getByText("Draft the brief")).toBeVisible();
    expect(screen.getByText("const ready = true;")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  });
});
