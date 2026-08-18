import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";

export type { UnlistenFn };

/** Version string of the running bundle, for comparing against a release. */
export const getInstalledVersion = () => getVersion();

/** Restarts the bundle so a downloaded update takes effect. */
export const restartForUpdate = () => relaunch();

export type UpdateStatus = {
  configured: boolean;
  available: boolean;
  version: string | null;
};

export const getUpdateStatus = () => invoke<UpdateStatus>("get_update_status");

export type UpdateDownloadProgress = {
  downloaded: number;
  total?: number | null;
  progress?: number | null;
};

export const checkForUpdates = () => invoke<void>("check_for_updates");

export const downloadAndInstallUpdate = () =>
  invoke<void>("download_and_install_update");

export const subscribeUpdaterCheck = (handler: () => void) =>
  listen("updater:check", handler);

export const subscribeUpdateProgress = (
  handler: (payload: UpdateDownloadProgress) => void,
): Promise<UnlistenFn> =>
  listen<UpdateDownloadProgress>("update:download-progress", ({ payload }) =>
    handler(payload),
  );

export const subscribeUpdateAvailable = (handler: (payload: void) => void) =>
  listen("update:available", () => handler(undefined));

export const subscribeUpdateCleared = (handler: (payload: void) => void) =>
  listen("update:cleared", () => handler(undefined));

export const requestUpdaterCheck = () => emit("updater:check");
