import type { ChatMessage } from "@looper/data";
import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposer } from "../chat-composer";
import { MessagesTimeline } from "../messages-timeline";

afterEach(cleanup);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWithI18n(node: React.ReactNode) {
  return render(<I18nProvider defaultLocale="en">{node}</I18nProvider>);
}

describe("agent mobile controls", () => {
  it("keeps the composer action tappable and announces send errors", () => {
    renderWithI18n(<ChatComposer onSend={vi.fn()} error="The message could not be sent." />);

    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("size-11", "sm:size-9");
    expect(screen.getByRole("alert")).toHaveTextContent("The message could not be sent.");
  });

  it("keeps message actions visible and tappable without hover on mobile", () => {
    const messages = [
      {
        _id: "assistant-1",
        role: "assistant",
        status: "done",
        content: "A concise answer.",
      },
    ] as ChatMessage[];

    renderWithI18n(<MessagesTimeline messages={messages} onRegenerate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Copy" })).toHaveClass("h-11", "sm:h-auto");
    expect(screen.getByRole("button", { name: "Regenerate" })).toHaveClass("h-11", "sm:h-auto");
  });
});
