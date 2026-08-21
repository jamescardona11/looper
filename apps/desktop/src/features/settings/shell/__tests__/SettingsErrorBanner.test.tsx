// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsErrorBanner } from "../SettingsErrorBanner";

vi.mock("../../../../shared/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("SettingsErrorBanner", () => {
  test("announces the error at the top of the settings work surface", () => {
    const onOpenTab = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <SettingsErrorBanner
          error="Shortcut already in use"
          sourceTab="general"
          onOpenTab={onOpenTab}
        />
      </I18nProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-notification-position")).toBe("main-top");
    expect(alert.getAttribute("aria-live")).toBe("assertive");

    fireEvent.click(screen.getByRole("button", { name: "Review error" }));
    expect(onOpenTab).toHaveBeenCalledWith("general");
  });

  test("does not render stale interactive notification content", () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <SettingsErrorBanner
          error={null}
          sourceTab={null}
          onOpenTab={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(container.querySelector("[data-notification-position]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
