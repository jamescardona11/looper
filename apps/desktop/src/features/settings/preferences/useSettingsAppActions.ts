import { emit } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import {
  exportCompleteArchive,
  openDataDirectory,
  openScreenCaptureSettings,
  requestScreenCapturePermission,
} from "../../../data/settings";
import { i18n } from "../../../i18n";
import { TEXT_SIZE_MODE_STORAGE_KEY } from "../../../shared/lib/textSize";
import type { TextSizeMode, ThemeMode } from "../../../types/index";

type SettingsAppActionsOptions = {
  dataDirectory?: string;
  setScreenContext: (enabled: boolean) => void;
  setTextSize: (mode: TextSizeMode) => void;
  setTheme: (mode: ThemeMode) => void;
  setAutoLaunch: (enabled: boolean) => void;
  setStartInBackground: (enabled: boolean) => void;
  installCli: () => Promise<unknown>;
  removeCli: () => Promise<unknown>;
  clearError: () => void;
  showError: (message: string, source: "about" | "app") => void;
};

export function useSettingsAppActions({
  dataDirectory,
  setScreenContext,
  setTextSize,
  setTheme,
  setAutoLaunch,
  setStartInBackground,
  installCli,
  removeCli,
  clearError,
  showError,
}: SettingsAppActionsOptions) {
  const [archiveStatus, setArchiveStatus] = useState<
    "idle" | "exporting" | "complete"
  >("idle");

  const toggleScreenContext = useCallback(
    (enabled: boolean) => {
      setScreenContext(enabled);
      if (!enabled) return;

      void requestScreenCapturePermission()
        .then((granted) => (granted ? undefined : openScreenCaptureSettings()))
        .catch(() => undefined);
    },
    [setScreenContext],
  );

  const changeTextSize = useCallback(
    (mode: TextSizeMode) => {
      setTextSize(mode);
      localStorage.setItem(TEXT_SIZE_MODE_STORAGE_KEY, mode);
      void emit("ui:text_size_changed", { mode }).catch(() => undefined);
    },
    [setTextSize],
  );

  const changeTheme = useCallback(
    (mode: ThemeMode) => {
      setTheme(mode);
      void emit("ui:theme_changed", { mode }).catch(() => undefined);
    },
    [setTheme],
  );

  const changeAutoLaunch = useCallback(
    (enabled: boolean) => {
      setAutoLaunch(enabled);
      setStartInBackground(enabled);
    },
    [setAutoLaunch, setStartInBackground],
  );

  const openDataFolder = useCallback(async () => {
    if (!dataDirectory) return;
    try {
      await openDataDirectory(dataDirectory);
    } catch (error) {
      console.error("Failed to open data directory:", error);
    }
  }, [dataDirectory]);

  const exportArchive = useCallback(async () => {
    if (archiveStatus === "exporting") return;
    const date = new Date().toISOString().slice(0, 10);
    const selectedPath = await save({
      title: i18n._({
        id: "settings.about.export.title",
        message: "Export all Looper data",
      }),
      defaultPath: `looper-complete-export-${date}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!selectedPath) return;

    const archivePath = selectedPath.toLowerCase().endsWith(".zip")
      ? selectedPath
      : `${selectedPath}.zip`;
    setArchiveStatus("exporting");
    clearError();
    try {
      await exportCompleteArchive(archivePath);
      setArchiveStatus("complete");
    } catch (error) {
      setArchiveStatus("idle");
      showError(
        error instanceof Error ? error.message : String(error),
        "about",
      );
    }
  }, [archiveStatus, clearError, showError]);

  const runCliAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        console.error(error);
        showError(String(error), "app");
      }
    },
    [showError],
  );

  return {
    setUseScreenContext: toggleScreenContext,
    setTextSizeMode: changeTextSize,
    setThemeMode: changeTheme,
    setAutoLaunchEnabled: changeAutoLaunch,
    openDataDirectory: openDataFolder,
    exportArchive,
    archiveStatus,
    installCli: () => runCliAction(installCli),
    removeCli: () => runCliAction(removeCli),
  };
}

export function formatByteCount(bytes: number) {
  if (bytes === 0) return "0 B";
  const base = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
  const precision = unitIndex >= 3 ? 1 : 0;
  const amount = Number((bytes / base ** unitIndex).toFixed(precision));
  return `${amount} ${units[unitIndex]}`;
}
