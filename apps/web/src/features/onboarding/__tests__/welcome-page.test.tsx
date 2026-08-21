import { I18nProvider } from "@looper/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    isLoading: false,
  },
  onboarding: {
    currentStep: "profile" as string | null,
    completedSteps: [] as string[],
    isComplete: false,
    isLoading: false,
    complete: vi.fn(),
    skip: vi.fn(),
    skipAll: vi.fn(),
  },
  navigate: vi.fn(),
}));

vi.mock("@looper/data", () => ({
  useOnboarding: () => mocks.onboarding,
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({
    to,
    search,
    replace,
  }: {
    to: string;
    search?: Record<string, string>;
    replace?: boolean;
  }) => (
    <div
      data-replace={replace ? "true" : "false"}
      data-search={search ? JSON.stringify(search) : ""}
      data-testid="navigate"
      data-to={to}
    />
  ),
  useNavigate: () => mocks.navigate,
}));

import { WelcomePage } from "../welcome-page";

beforeEach(() => {
  mocks.auth.isAuthenticated = true;
  mocks.auth.isLoading = false;
  mocks.onboarding.currentStep = "profile";
  mocks.onboarding.completedSteps = [];
  mocks.onboarding.isComplete = false;
  mocks.onboarding.isLoading = false;
  mocks.onboarding.complete.mockReset();
  mocks.onboarding.complete.mockResolvedValue(undefined);
  mocks.onboarding.skip.mockReset();
  mocks.onboarding.skip.mockResolvedValue(undefined);
  mocks.onboarding.skipAll.mockReset();
  mocks.onboarding.skipAll.mockResolvedValue(undefined);
  mocks.navigate.mockReset();
  mocks.navigate.mockResolvedValue(undefined);
});

afterEach(cleanup);

function renderWelcome(node: ReactNode = <WelcomePage />) {
  return render(<I18nProvider defaultLocale="en">{node}</I18nProvider>);
}

describe("WelcomePage", () => {
  it("redirects signed-out users to sign in", () => {
    mocks.auth.isAuthenticated = false;

    renderWelcome();

    expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/sign-in");
    expect(screen.getByTestId("navigate")).toHaveAttribute("data-replace", "true");
  });

  it("redirects completed settings launches to the API key tab", () => {
    mocks.onboarding.isComplete = true;

    renderWelcome(<WelcomePage launchTarget="/settings" />);

    expect(screen.getByTestId("navigate")).toHaveAttribute("data-to", "/settings");
    expect(screen.getByTestId("navigate")).toHaveAttribute("data-search", '{"tab":"keys"}');
  });

  it("saves the selected first outcome from the profile step", async () => {
    renderWelcome();

    fireEvent.click(screen.getByRole("button", { name: /Transcribe audio/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mocks.onboarding.complete).toHaveBeenCalledWith("profile", { intent: "voice" });
    });
  });

  it("launches free users toward the recording assistant and completes the tour", async () => {
    mocks.onboarding.currentStep = "tour";

    renderWelcome();

    fireEvent.click(screen.getByRole("button", { name: /Open Recording assistant/ }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/welcome",
        search: { launch: "/agent" },
        replace: true,
      });
    });
    expect(mocks.onboarding.complete).toHaveBeenCalledWith("tour", {
      intent: "chat",
      access: "free",
    });
  });
});
