// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const revealLogs = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resetOnboarding = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../../../data/settings", () => ({
  revealLogs,
  resetOnboarding,
}));
vi.mock("../../../../updates/components/UpdateChecker", () => ({
  UpdateChecker: () => <div>Update status</div>,
}));

import AboutTab from "../AboutTab";
import type { AppInfo, CliInstallStatus } from "../../../../../types";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const appInfo: AppInfo = {
  version: "1.2.3",
  data_dir_path: "/Users/test/Looper",
  data_dir_size_bytes: 10,
  storage_breakdown: {
    recordings_bytes: 1,
    library_bytes: 2,
    models_bytes: 3,
    databases_bytes: 4,
    total_bytes: 10,
  },
};

const cliStatus: CliInstallStatus = {
  installed: true,
  managedByApp: true,
  sourceAvailable: true,
  installPath: "/usr/local/bin/looper",
  sourcePath: "/bundle/looper",
  command: "looper",
  pathInShell: true,
};

afterEach(cleanup);

describe("AboutTab", () => {
  test("keeps support, storage, export, help and CLI actions connected", () => {
    const openData = vi.fn();
    const exportArchive = vi.fn();
    const openFaq = vi.fn();
    const removeCli = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <AboutTab
          variants={{ hidden: {}, visible: {}, exit: {} }}
          appInfo={appInfo}
          transcriptionMode="local"
          formatBytes={(bytes) => `${bytes} B`}
          cliInstallStatus={cliStatus}
          cliInstallBusy={false}
          activeLicense
          onInstallCli={vi.fn()}
          onRemoveCli={removeCli}
          onOpenDataDir={openData}
          onExportArchive={exportArchive}
          archiveExportStatus="idle"
          onOpenFAQ={openFaq}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("1.2.3")).toBeTruthy();
    expect(screen.getByText("10 B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    fireEvent.click(screen.getByRole("button", { name: "/Users/test/Looper" }));
    fireEvent.click(screen.getByRole("button", { name: /Export all data/ }));
    fireEvent.click(screen.getByRole("button", { name: /FAQ & Help/ }));
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));

    expect(revealLogs).toHaveBeenCalledOnce();
    expect(openData).toHaveBeenCalledOnce();
    expect(exportArchive).toHaveBeenCalledOnce();
    expect(openFaq).toHaveBeenCalledOnce();
    expect(removeCli).toHaveBeenCalledOnce();
  });
});
