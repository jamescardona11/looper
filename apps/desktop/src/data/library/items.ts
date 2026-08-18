import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  ExportFormat,
  LibraryFilter,
  LibraryImportOptions,
  LibraryItem,
  LibraryItemPatch,
  LibraryItemsPage,
  LibraryTranslation,
} from "../../types";

export const resolveLibraryAudioUrl = (audioPath: string): string =>
  convertFileSrc(audioPath);

export const createLibraryItem = (
  path: string,
  options: LibraryImportOptions,
): Promise<LibraryItem> => invoke("create_library_item", { path, options });

export const getLibraryItemsPage = (
  filter: LibraryFilter,
  limit: number,
  offset: number,
): Promise<LibraryItemsPage> =>
  invoke("get_library_items_page", { filter, limit, offset });

export const updateLibraryItem = (
  id: string,
  patch: LibraryItemPatch,
): Promise<LibraryItem> => invoke("update_library_item", { id, patch });

async function runItemCommand(command: string, id: string): Promise<void> {
  await invoke(command, { id });
}

export const deleteLibraryItem = (id: string): Promise<void> =>
  runItemCommand("delete_library_item", id);

export const cancelLibraryTranscription = (id: string): Promise<void> =>
  runItemCommand("cancel_library_transcription", id);

export const retryLibraryTranscription = (id: string): Promise<void> =>
  runItemCommand("retry_library_transcription", id);

export async function exportLibraryItemToPath(
  id: string,
  format: ExportFormat,
  outputPath: string,
): Promise<void> {
  await invoke("export_library_item_to_path", { id, format, outputPath });
}

export const getLibraryTags = (): Promise<string[]> =>
  invoke("get_library_tags");

export const getLibraryTranslations = (
  itemId: string,
): Promise<LibraryTranslation[]> =>
  invoke("get_library_translations", { itemId });

export const translateLibraryItem = (
  itemId: string,
  language: string,
): Promise<LibraryTranslation> =>
  invoke("translate_library_item", { itemId, language });

export async function deleteLibraryTranslation(
  itemId: string,
  language: string,
): Promise<void> {
  await invoke("delete_library_translation", { itemId, language });
}
