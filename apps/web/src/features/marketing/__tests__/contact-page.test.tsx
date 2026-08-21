import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { submitContact } = vi.hoisted(() => ({
  submitContact: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useFeedback: () => submitContact,
}));

vi.mock("@/shared/components/public-page-nav", () => ({
  PublicPageNav: () => null,
}));

import { resolveContactIntent } from "../contact-intent";
import { ContactPage } from "../contact-page";

afterEach(() => {
  cleanup();
  submitContact.mockReset();
});

describe("ContactPage", () => {
  it("accepts only the supported purchase intent", () => {
    expect(resolveContactIntent("purchase")).toBe("purchase");
    expect(resolveContactIntent("sales")).toBeUndefined();
    expect(resolveContactIntent(null)).toBeUndefined();
  });

  it("stores a purchase request with explicit lead context", async () => {
    submitContact.mockResolvedValue(undefined);

    render(
      <I18nProvider defaultLocale="en">
        <ContactPage intent="purchase" />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("GitHub username"), {
      target: { value: " @ada-lovelace " },
    });
    const optionalQuestion = screen.getByLabelText("Compatibility or delivery question (optional)");
    expect(optionalQuestion).not.toBeRequired();
    fireEvent.change(optionalQuestion, {
      target: { value: "Does the React Native app include independent tests?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send purchase request" }));

    await waitFor(() => {
      expect(submitContact).toHaveBeenCalledWith({
        kind: "other",
        message:
          "[purchase-request]\nName: Ada Lovelace\nEmail: ada@example.com\nGitHub: ada-lovelace\n\nDoes the React Native app include independent tests?",
        path: "/contact?intent=purchase",
      });
    });

    expect(screen.getByRole("heading", { name: "Purchase request received" })).toBeVisible();
    expect(screen.queryByText("hello@example.test")).not.toBeInTheDocument();
  });

  it("rejects an invalid GitHub username before storing a purchase request", async () => {
    render(
      <I18nProvider defaultLocale="en">
        <ContactPage intent="purchase" />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("GitHub username"), {
      target: { value: "invalid--username" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send purchase request" }));

    expect(await screen.findByText("Enter a valid GitHub username.")).toBeVisible();
    expect(submitContact).not.toHaveBeenCalled();
  });
});
