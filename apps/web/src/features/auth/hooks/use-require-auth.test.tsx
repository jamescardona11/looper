import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  auth: { isAuthenticated: false, isLoading: true },
}));

vi.mock("@looper/data", () => ({
  useAuth: () => h.auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <span data-testid="navigate">{to}</span>,
}));

import { useRequireAuth } from "./use-require-auth";

function GateProbe({ loading }: { loading?: React.ReactNode }) {
  return useRequireAuth({ loading });
}

afterEach(cleanup);
beforeEach(() => {
  h.auth.isAuthenticated = false;
  h.auth.isLoading = true;
});

describe("useRequireAuth", () => {
  it("renders an accessible route loader while auth hydrates", () => {
    render(
      <I18nProvider defaultLocale="en">
        <GateProbe />
      </I18nProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.getByText("Preparing your workspace")).toBeVisible();
  });

  it("preserves a route-specific loading fallback", () => {
    render(<GateProbe loading={<span>Custom loading</span>} />);

    expect(screen.getByText("Custom loading")).toBeVisible();
  });

  it("redirects signed-out users after hydration", () => {
    h.auth.isLoading = false;
    render(<GateProbe />);

    expect(screen.getByTestId("navigate")).toHaveTextContent("/sign-in");
  });
});
