// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const openUrl = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

import CustomerPortalLink from "./CustomerPortalLink";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

beforeEach(() => {
  openUrl.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("VITE_LOOPER_CUSTOMER_PORTAL", "https://billing.test/portal");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CustomerPortalLink", () => {
  test("opens the tracked portal destination without changing its button", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <CustomerPortalLink source="settings_account" className="portal-link" />
      </I18nProvider>,
    );

    const button = screen.getByRole("button", { name: "Customer portal" });
    expect(button.className).toBe("portal-link");
    fireEvent.click(button);

    await waitFor(() => expect(openUrl).toHaveBeenCalledOnce());
    const destination = new URL(openUrl.mock.calls[0][0]);
    expect(destination.origin + destination.pathname).toBe(
      "https://billing.test/portal",
    );
    expect(destination.searchParams.get("utm_content")).toBe(
      "settings_account",
    );
  });

  test("renders nothing when the portal destination is not configured", () => {
    vi.stubEnv("VITE_LOOPER_CUSTOMER_PORTAL", "");

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <CustomerPortalLink source="onboarding" />
      </I18nProvider>,
    );

    expect(container.childElementCount).toBe(0);
  });
});
