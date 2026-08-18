import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changelog } from "./entries";

vi.mock("@looper/data", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { ChangelogPage } from "./changelog-page";

afterEach(cleanup);

describe("ChangelogPage", () => {
  it("renders public changelog entries with Looper navigation", () => {
    render(
      <I18nProvider defaultLocale="en">
        <ChangelogPage />
      </I18nProvider>,
    );

    expect(screen.getByRole("link", { name: /Looper/ })).toHaveAttribute("href", "/landing");
    expect(screen.getByRole("heading", { name: "Changelog" })).toBeVisible();
    expect(screen.getByText("What's new in each release.")).toBeVisible();
    expect(screen.getByRole("heading", { name: changelog[0]!.version })).toBeVisible();
    expect(
      screen.getByText(
        "Private recording assistant grounded in opt-in, text-only transcript memory",
      ),
    ).toBeVisible();
  });
});
