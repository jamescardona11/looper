import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@looper/data", () => ({
  useFeedback: () => vi.fn(),
}));

import { FeedbackWidget } from "./feedback-widget";

afterEach(cleanup);

describe("FeedbackWidget", () => {
  it("keeps the public launcher off narrow screens without removing desktop access", () => {
    localStorage.setItem("cookie-consent", "accepted");

    render(
      <I18nProvider defaultLocale="en">
        <FeedbackWidget hideMobile />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Send feedback" })).toHaveClass("hidden", "sm:flex");
  });

  it("stays hidden at every breakpoint while cookie consent is pending", () => {
    localStorage.removeItem("cookie-consent");

    render(
      <I18nProvider defaultLocale="en">
        <FeedbackWidget hideMobile />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Send feedback" })).toHaveClass("hidden");
    expect(screen.getByRole("button", { name: "Send feedback" })).not.toHaveClass("sm:flex");
  });
});
