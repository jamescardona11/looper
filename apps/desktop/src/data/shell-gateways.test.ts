import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  emit: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: tauri.emit,
  listen: tauri.listen,
}));

import { getCliInstallStatus, installCli, removeCli } from "./cli";
import {
  subscribeNavigateAbout,
  subscribeNavigateFeatureLab,
  subscribeNavigateHistory,
  subscribeNavigateModels,
  subscribeNavigateSettings,
} from "./navigation";
import { reportFrontendCrashEvent } from "./telemetry";
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  getUpdateStatus,
  requestUpdaterCheck,
  subscribeUpdateProgress,
} from "./updates";

describe("desktop shell native gateways", () => {
  beforeEach(() => {
    tauri.emit.mockReset();
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes CLI and update commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await getCliInstallStatus();
    await installCli();
    await removeCli();
    await getUpdateStatus();
    await checkForUpdates();
    await downloadAndInstallUpdate();

    expect(tauri.invoke.mock.calls.map(([command]) => command)).toEqual([
      "get_cli_install_status",
      "install_cli",
      "remove_cli",
      "get_update_status",
      "check_for_updates",
      "download_and_install_update",
    ]);
  });

  test("subscribes every shell navigation destination", async () => {
    tauri.listen.mockResolvedValue(vi.fn());
    const handler = vi.fn();

    await subscribeNavigateSettings(handler);
    await subscribeNavigateAbout(handler);
    await subscribeNavigateHistory(handler);
    await subscribeNavigateModels(handler);
    await subscribeNavigateFeatureLab(handler);

    expect(tauri.listen.mock.calls.map(([channel]) => channel)).toEqual([
      "navigate:settings",
      "navigate:about",
      "navigate:history",
      "navigate:models",
      "navigate:feature-lab",
    ]);
  });

  test("forwards crash details and update progress without reshaping", async () => {
    tauri.invoke.mockResolvedValue(undefined);
    tauri.listen.mockResolvedValue(vi.fn());
    const crash = {
      windowLabel: "main",
      source: "react",
      errorKind: "render",
      fingerprint: "abc123",
    };
    const progress = vi.fn();

    await reportFrontendCrashEvent(crash);
    await subscribeUpdateProgress(progress);
    tauri.listen.mock.calls[0]?.[1]({
      payload: { downloaded: 50, total: 100, progress: 0.5 },
    });
    await requestUpdaterCheck();

    expect(tauri.invoke).toHaveBeenCalledWith("report_frontend_crash", crash);
    expect(progress).toHaveBeenCalledWith({
      downloaded: 50,
      total: 100,
      progress: 0.5,
    });
    expect(tauri.emit).toHaveBeenCalledWith("updater:check");
  });
});
