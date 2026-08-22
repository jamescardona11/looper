// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: {
    configured: true,
    available: false,
    version: null as string | null,
  },
  check: vi.fn(),
  download: vi.fn(),
  subscribeCheck: vi.fn(),
  subscribeProgress: vi.fn(),
  invalidate: vi.fn(),
  setQueryData: vi.fn(),
  getVersion: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("../../queries", () => ({
  updateKeys: { status: () => ["update-status"] },
  useUpdateStatus: () => ({ data: mocks.status }),
}));

vi.mock("../../../../data/system/updates", () => ({
  checkForUpdates: mocks.check,
  downloadAndInstallUpdate: mocks.download,
  getInstalledVersion: mocks.getVersion,
  restartForUpdate: mocks.relaunch,
  subscribeUpdaterCheck: mocks.subscribeCheck,
  subscribeUpdateProgress: mocks.subscribeProgress,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidate,
    setQueryData: mocks.setQueryData,
  }),
}));

import { UpdateChecker } from "../UpdateChecker";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function renderChecker(autoCheck = false) {
  return render(
    <I18nProvider i18n={i18n}>
      <UpdateChecker autoCheck={autoCheck} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  mocks.status = { configured: true, available: false, version: null };
  mocks.check.mockReset().mockResolvedValue(undefined);
  mocks.download.mockReset().mockResolvedValue(undefined);
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.setQueryData.mockReset();
  mocks.getVersion.mockReset().mockResolvedValue("1.0.1");
  mocks.relaunch.mockReset().mockResolvedValue(undefined);
  mocks.subscribeCheck.mockReset().mockResolvedValue(vi.fn());
  mocks.subscribeProgress.mockReset().mockResolvedValue(vi.fn());
  localStorage.clear();
});

afterEach(cleanup);

describe("UpdateChecker", () => {
  test("preserves the configured and up-to-date surfaces", () => {
    mocks.status = { configured: false, available: false, version: null };
    const configured = renderChecker();
    expect(
      screen.getByText("Update channel not configured").parentElement
        ?.className,
    ).toBe(
      "flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 h-[52px] bg-surface-surface",
    );
    configured.unmount();

    mocks.status = { configured: true, available: false, version: null };
    renderChecker();
    expect(screen.getByText("You're up to date")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeTruthy();
  });

  test("checks manually and invalidates the status query", async () => {
    renderChecker();
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText("Checking for updates...")).toBeTruthy();
    await waitFor(() => expect(mocks.check).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(mocks.invalidate).toHaveBeenCalledWith({
        queryKey: ["update-status"],
      }),
    );
  });

  test("downloads an available version and records the pending restart", async () => {
    mocks.status = { configured: true, available: true, version: "1.2.0" };
    renderChecker();
    expect(screen.getByText("v1.2.0 available")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByText("Update installed")).toBeTruthy(),
    );

    expect(localStorage.getItem("looper_update_pending_restart")).toBe("1.2.0");
    expect(mocks.setQueryData).toHaveBeenCalledWith(["update-status"], {
      configured: true,
      available: false,
      version: null,
    });
  });

  test("restores a pending restart and relaunches on demand", async () => {
    localStorage.setItem("looper_update_pending_restart", "1.2.0");
    renderChecker();

    expect(await screen.findByText("Restart to apply")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
    expect(localStorage.getItem("looper_update_pending_restart")).toBeNull();
  });

  test("keeps check failures retryable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.check.mockRejectedValueOnce(new Error("offline"));
    renderChecker();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Update check failed")).toBeTruthy();
    expect(screen.getByText("offline")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(2));
  });
});
