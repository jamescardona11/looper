import { I18nProvider } from "@looper/i18n/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@looper/data", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePolarCheckout: () => ({
    createCheckout: vi.fn(),
    openPortal: vi.fn(),
    createOneTimeCheckout: vi.fn(),
  }),
  useSubscription: () => ({ tier: "free", isLoading: false }),
}));

vi.mock("../hooks/use-billing-actions", () => ({
  BILLING_ENABLED: false,
  CREDIT_PACKS_ENABLED: false,
  DEFAULT_PAYMENT_PROVIDER: "polar",
  SHOW_PAYMENT_PROVIDER_TOGGLE: false,
  paymentProviderSupportsYearly: () => false,
  useBillingActions: () => ({
    openPortal: vi.fn(),
    upgrade: vi.fn(),
    buyCredits: vi.fn(),
    busy: null,
    error: null,
  }),
}));

import { BillingPage } from "../billing-page";

afterEach(cleanup);

describe("BillingPage", () => {
  it("explains when checkout is not configured", () => {
    render(
      <I18nProvider defaultLocale="en">
        <BillingPage />
      </I18nProvider>,
    );

    expect(screen.getAllByRole("button", { name: "Billing not configured" })).not.toHaveLength(0);
  });
});
