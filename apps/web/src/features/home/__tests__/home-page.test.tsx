import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

type AuthState = { isAuthenticated: boolean; isLoading: boolean };
type CurrentUser = { email: string } | null;

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false } as AuthState,
  user: { email: "ada@looper.local" } as CurrentUser,
}));

vi.mock("@looper/data", () => ({
  useCurrentUser: () => ({ user: mocks.user }),
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <span data-testid="redirect">{to}</span>,
}));

import { HomePage } from "../home-page";

afterEach(() => {
  cleanup();
  mocks.auth = { isAuthenticated: true, isLoading: false };
  mocks.user = { email: "ada@looper.local" };
});

describe("HomePage", () => {
  it("renders the authenticated workspace launchers", () => {
    render(
      <I18nProvider defaultLocale="en">
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: /Welcome back, ada/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Recording assistant/ })).toHaveAttribute(
      "href",
      "/agent",
    );
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/library");
  });

  it("redirects unauthenticated users to sign in", () => {
    mocks.auth = { isAuthenticated: false, isLoading: false };

    render(
      <I18nProvider defaultLocale="en">
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByTestId("redirect")).toHaveTextContent("/sign-in");
  });
});
