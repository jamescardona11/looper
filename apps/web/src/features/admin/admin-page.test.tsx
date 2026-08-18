import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@looper/data", () => ({
  useAdmin: () => ({
    userCount: 2,
    activeCount: 1,
    subStats: { pro: 1, ultra: 0 },
    usageStats: { estimatedCostUsd: 4.25, totalTokens: 12000, messages: 18 },
    usageByUser: [
      {
        userId: "user-1",
        name: "Ada",
        email: "ada@example.com",
        messages: 12,
        totalTokens: 9000,
        estimatedCostUsd: 3.5,
      },
    ],
    users: [
      {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
        tier: "pro",
        isActive: true,
        joinedAt: Date.UTC(2026, 0, 1),
      },
      {
        id: "user-2",
        name: null,
        email: "lin@example.com",
        tier: "free",
        isActive: false,
        joinedAt: Date.UTC(2026, 1, 1),
      },
    ],
  }),
  useAdminActions: () => ({
    grantTier: vi.fn(),
    promote: vi.fn(),
    demote: vi.fn(),
  }),
  useAdminUserDetails: () => undefined,
  useIsAdmin: () => true,
}));

vi.mock("@/shared/components/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

import { AdminDashboard } from "./admin-page";

afterEach(cleanup);

describe("AdminDashboard", () => {
  it("presents spend and user management as responsive lists", () => {
    render(
      <I18nProvider defaultLocale="en">
        <AdminDashboard />
      </I18nProvider>,
    );

    const spenders = screen.getByRole("region", { name: "Top spenders" });
    expect(within(spenders).getByRole("list")).toBeVisible();
    expect(within(spenders).getByText("ada@example.com")).toBeVisible();

    const users = screen.getByRole("region", { name: "All Users" });
    expect(within(users).getAllByRole("listitem")).toHaveLength(2);
    expect(within(users).getAllByRole("combobox", { name: "Set tier" })).toHaveLength(2);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
