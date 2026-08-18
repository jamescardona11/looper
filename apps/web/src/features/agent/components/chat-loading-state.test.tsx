import { I18nProvider } from "@looper/i18n/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatLoadingState } from "./chat-loading-state";

describe("ChatLoadingState", () => {
  it("announces what the product is preparing", () => {
    render(
      <I18nProvider defaultLocale="en">
        <ChatLoadingState />
      </I18nProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Preparing your recording assistant");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your private recording questions and transcript context.",
    );
  });
});
