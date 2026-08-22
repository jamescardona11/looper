import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicPageNav } from "../public-page-nav";

const mocks = vi.hoisted(() => ({
  isAuthenticated: false,
}));

vi.mock("@looper/data", () => ({
  useAuth: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.isAuthenticated = false;
});

function renderNav(node: ReactNode) {
  return render(<I18nProvider defaultLocale="en">{node}</I18nProvider>);
}

describe("PublicPageNav", () => {
  it("shows public navigation and sign-in CTAs for signed-out visitors", () => {
    renderNav(<PublicPageNav />);

    expect(screen.getByRole("link", { name: /Looper/ })).toHaveAttribute("href", "/landing");
    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: "Changelog" })).toHaveAttribute("href", "/changelog");
    expect(screen.getByRole("link", { name: "Roadmap" })).toHaveAttribute("href", "/roadmap");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/sign-in");
  });

  it("opens the app for authenticated visitors", () => {
    mocks.isAuthenticated = true;

    renderNav(<PublicPageNav />);

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/home");
  });

  it("uses the local public home without nav CTAs during purchase requests", () => {
    renderNav(<PublicPageNav purchaseRequest />);

    expect(screen.getByRole("link", { name: /Looper/ })).toHaveAttribute("href", "/landing");
    expect(screen.queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Get Started" })).not.toBeInTheDocument();
  });
});
