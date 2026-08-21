import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@looper/data", () => ({
  useAccountData: () => ({
    deleteAccount: vi.fn(),
    exportMyData: vi.fn(),
  }),
  useCurrentUser: () => ({ user: { email: "ada@looper.local", isAnonymous: false } }),
  useSubscription: () => ({ tier: "free", isLoading: false }),
}));

vi.mock("@/features/auth", () => ({
  UpgradeFromAnonymousForm: () => null,
  useAuth: () => ({}),
  useRequireAuth: () => null,
}));

vi.mock("@/shared/components/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

import { SettingsPage } from "../settings-page";

afterEach(cleanup);

describe("SettingsPage", () => {
  it("renders the settings shell and active language tab", () => {
    render(
      <I18nProvider defaultLocale="en">
        <SettingsPage activeTab="language" onTabChange={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("heading", { name: "Settings" })).toHaveLength(2);
    const navigation = screen.getByRole("navigation", { name: "Settings section" });
    expect(navigation).toBeVisible();
    expect(within(navigation).getByRole("button", { name: /Language/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /English/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Español/ })).toBeVisible();
  });

  it("hides subscription from settings while the app is free", () => {
    render(
      <I18nProvider defaultLocale="en">
        <SettingsPage activeTab="language" onTabChange={vi.fn()} />
      </I18nProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "Settings section" });
    expect(within(navigation).queryByRole("button", { name: "Subscription" })).toBeNull();
    expect(screen.queryByText("Manage your plan and billing.")).toBeNull();
  });
});
