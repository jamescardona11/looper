// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../license/components/MemberCard", () => ({
  default: ({ active }: { active: boolean }) => (
    <div>{active ? "Active membership" : "Trial membership"}</div>
  ),
}));
vi.mock("../../../license/components/CustomerPortalLink", () => ({
  default: () => <a href="#portal">Customer portal</a>,
}));

import type { LicenseState } from "../../../../data/license";
import AccountView from "../AccountView";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const activeLicense: LicenseState = {
  status: "active",
  licenseGateActive: true,
  trialActive: false,
  trialStartedAt: "2026-08-01T00:00:00.000Z",
  trialEndsAt: "2026-08-15T00:00:00.000Z",
  trialDaysRemaining: 0,
  activationsLimit: 1,
};

function renderAccount(onDeactivateLicense = vi.fn()) {
  render(
    <I18nProvider i18n={i18n}>
      <AccountView
        licenseState={activeLicense}
        licenseLoading={false}
        activating={false}
        deactivating={false}
        openingTarget={null}
        openError="Checkout unavailable"
        activationError={null}
        deactivationError="Device unavailable"
        onOpenCheckout={vi.fn()}
        onActivateLicense={vi.fn()}
        onDeactivateLicense={onDeactivateLicense}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AccountView presentation contract", () => {
  test("keeps independent account errors in the alert region", () => {
    renderAccount();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Device unavailable");
    expect(alert.textContent).toContain("Checkout unavailable");
    expect(alert.className).toContain("max-w-[400px]");
  });

  test("cancels and expires the deactivation confirmation safely", () => {
    vi.useFakeTimers();
    const deactivate = vi.fn();
    renderAccount(deactivate);
    const request = () =>
      screen.getByRole("button", { name: "Deactivate this device" });

    fireEvent.click(request());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(request()).toBeTruthy();
    fireEvent.click(request());
    act(() => vi.advanceTimersByTime(3_000));
    expect(request()).toBeTruthy();
    expect(deactivate).not.toHaveBeenCalled();
  });
});
