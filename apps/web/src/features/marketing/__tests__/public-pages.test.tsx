import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  joinWaitlist: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useAuth: () => ({ isAuthenticated: false }),
  useWaitlist: () => ({
    join: mocks.joinWaitlist,
    total: 42,
    status: { position: 7, referralCount: 1 },
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/shared/components/public-page-nav", () => ({
  PublicPageNav: () => null,
}));

import { PrivacyPage, TermsPage } from "@/features/legal";
import { RoadmapPage } from "@/features/roadmap";
import { PricingPage } from "../pricing-page";
import { WaitlistPage } from "../waitlist-page";

afterEach(() => {
  cleanup();
  mocks.joinWaitlist.mockReset();
});

describe("public Web pages", () => {
  it("renders pricing plans and structured FAQ content", () => {
    render(
      <I18nProvider defaultLocale="en">
        <PricingPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Simple, transparent pricing" })).toBeVisible();
    expect(screen.getAllByText("Pro").length).toBeGreaterThan(0);
    expect(screen.getByText("Best value")).toBeVisible();
    expect(document.querySelector('script[type="application/ld+json"]')).not.toBeNull();
  });

  it("renders the roadmap status columns", () => {
    render(
      <I18nProvider defaultLocale="en">
        <RoadmapPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Roadmap" })).toBeVisible();
    expect(screen.getByText("Shipped")).toBeVisible();
    expect(screen.getByText("Planned")).toBeVisible();
    expect(screen.getByText("Recording assistant")).toBeVisible();
  });

  it("renders legal contact details with Looper identity", () => {
    render(
      <I18nProvider defaultLocale="en">
        <PrivacyPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    expect(screen.getByRole("link", { name: "contact form" })).toHaveAttribute("href", "/contact");
    cleanup();

    render(
      <I18nProvider defaultLocale="en">
        <TermsPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    for (const link of screen.getAllByRole("link", { name: "contact form" })) {
      expect(link).toHaveAttribute("href", "/contact");
    }
  });

  it("submits the waitlist and exposes a referral URL", async () => {
    mocks.joinWaitlist.mockResolvedValue({
      referralCode: "ada7",
      alreadyJoined: false,
    });

    render(
      <I18nProvider defaultLocale="en">
        <WaitlistPage referredBy="grace" />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: " ada@example.test " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    await waitFor(() => {
      expect(mocks.joinWaitlist).toHaveBeenCalledWith({
        email: "ada@example.test",
        referredBy: "grace",
      });
    });

    expect(screen.getByRole("heading", { name: /You're in/ })).toBeVisible();
    expect(screen.getByDisplayValue(/\/waitlist\?ref=ada7$/)).toBeVisible();
  });
});
