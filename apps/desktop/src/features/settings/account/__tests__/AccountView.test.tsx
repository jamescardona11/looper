// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../license/components/MemberCard", () => ({
  default: ({ active }: { active: boolean }) => (
    <div>{active ? "Active membership" : "Trial membership"}</div>
  ),
}));
vi.mock("../../../license/components/CustomerPortalLink", () => ({
  default: () => <a href="#portal">Customer portal</a>,
}));

import AccountView from "../AccountView";
import type { LicenseState } from "../../../../data/license";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const state = (overrides: Partial<LicenseState> = {}): LicenseState => ({
  status: "trial",
  licenseGateActive: true,
  trialActive: true,
  trialStartedAt: "2026-08-01T00:00:00.000Z",
  trialEndsAt: "2026-08-20T00:00:00.000Z",
  trialDaysRemaining: 5,
  activationsLimit: 1,
  ...overrides,
});

const renderAccount = (
  licenseState: LicenseState,
  onActivateLicense = vi.fn(),
  onDeactivateLicense = vi.fn(),
) => {
  render(
    <I18nProvider i18n={i18n}>
      <AccountView
        licenseState={licenseState}
        licenseLoading={false}
        activating={false}
        deactivating={false}
        openingTarget={null}
        openError={null}
        activationError={null}
        deactivationError={null}
        onOpenCheckout={vi.fn()}
        onActivateLicense={onActivateLicense}
        onDeactivateLicense={onDeactivateLicense}
      />
    </I18nProvider>,
  );
};

afterEach(cleanup);

describe("AccountView", () => {
  test("shows trial context and submits a normalized activation key", () => {
    const onActivate = vi.fn();
    renderAccount(state(), onActivate);

    expect(screen.getByText("Trial · 5 of 14 days left")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "License key" }), {
      target: { value: "  LOOPER_TEST  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledWith("LOOPER_TEST");
  });

  test("requires an explicit second action before deactivating", () => {
    const onDeactivate = vi.fn();
    renderAccount(
      state({
        status: "active",
        trialActive: false,
        expiresAt: "2027-08-16T00:00:00.000Z",
      }),
      vi.fn(),
      onDeactivate,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate this device" }),
    );
    expect(onDeactivate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(onDeactivate).toHaveBeenCalledOnce();
  });
});
