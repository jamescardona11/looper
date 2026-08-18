import { invoke } from "@tauri-apps/api/core";
import type {
  LibraryImportOptions,
  LibraryItem,
  LibraryWatchFolder,
  YoutubeImportMetadata,
} from "../../types";

export const getLibraryWatchFolders = (): Promise<LibraryWatchFolder[]> =>
  invoke("get_library_watch_folders");

export const addLibraryWatchFolder = (
  path: string,
  options: LibraryImportOptions,
): Promise<LibraryWatchFolder> =>
  invoke("add_library_watch_folder", { path, options });

export async function removeLibraryWatchFolder(path: string): Promise<void> {
  await invoke("remove_library_watch_folder", { path });
}

export const scanLibraryWatchFoldersNow = (): Promise<number> =>
  invoke("scan_library_watch_folders_now");

export const probeLibraryYoutubeUrl = (
  url: string,
): Promise<YoutubeImportMetadata> =>
  invoke("probe_library_youtube_url", { url });

export const createLibraryYoutubeItem = (
  metadata: YoutubeImportMetadata,
  options: LibraryImportOptions,
): Promise<LibraryItem> =>
  invoke("create_library_youtube_item", { metadata, options });

export const openFfmpegInstallHelp = async (): Promise<void> => {
  await invoke("open_ffmpeg_install");
};

export const showLibraryErrorToast = async (message: string): Promise<void> => {
  await invoke("debug_show_toast", { toastType: "error", message });
};

export const showLibraryToast = async (
  toastType: "error" | "warning",
  message: string,
): Promise<void> => {
  await invoke("debug_show_toast", { toastType, message });
};

export type ImportFileProbe = {
  path: string;
  duration_ms: number | null;
  size_bytes: number | null;
};

export const probeLibraryImportFiles = (
  paths: string[],
): Promise<ImportFileProbe[]> =>
  invoke("probe_library_import_files", { paths });
