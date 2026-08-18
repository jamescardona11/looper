// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CliInstallStatus } from "../../../../types";
import { AboutCli } from "./AboutCli";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const cliStatus = (
  overrides: Partial<CliInstallStatus> = {},
): CliInstallStatus => ({
  installed: false,
  managedByApp: false,
  sourceAvailable: true,
  installPath: "/usr/local/bin/looper",
  sourcePath: "/bundle/looper",
  command: "looper",
  pathInShell: true,
  ...overrides,
});

afterEach(cleanup);

describe("AboutCli presentation contract", () => {
  test("keeps unavailable command-line access visibly disabled", () => {
    const install = vi.fn();
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <AboutCli
          status={cliStatus({ sourceAvailable: false })}
          busy={false}
          activeAccess
          onInstall={install}
          onRemove={vi.fn()}
        />
      </I18nProvider>,
    );

    const action = screen.getByRole("button", { name: "Install CLI" });
    expect(action.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Not available in this build")).toBeTruthy();
    expect(container.firstElementChild?.className).toBe("space-y-2");
    fireEvent.click(action);
    expect(install).not.toHaveBeenCalled();
  });

  test("routes an app-managed installation to removal", () => {
    const remove = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <AboutCli
          status={cliStatus({ installed: true, managedByApp: true })}
          busy={false}
          activeAccess
          onInstall={vi.fn()}
          onRemove={remove}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.getByText("Installed at /usr/local/bin/looper")).toBeTruthy();
  });
});
