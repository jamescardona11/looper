import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type * as LibraryContract from "../../contracts";

const command = {
  create: "create_library_item",
  page: "get_library_items_page",
  update: "update_library_item",
  delete: "delete_library_item",
  cancel: "cancel_library_transcription",
  retry: "retry_library_transcription",
  export: "export_library_item_to_path",
  tags: "get_library_tags",
  translations: "get_library_translations",
  translate: "translate_library_item",
  deleteTranslation: "delete_library_translation",
} as const;

type NativePayload = Record<string, unknown>;

const run = <Result>(name: string, payload?: NativePayload) =>
  payload === undefined ? invoke<Result>(name) : invoke<Result>(name, payload);

const runForItem = (name: string, id: string) => run<void>(name, { id });

export const resolveLibraryAudioUrl = (audioPath: string): string =>
  convertFileSrc(audioPath);

type CreateArguments = [
  path: string,
  options: LibraryContract.LibraryImportOptions,
];
export const createLibraryItem = (...[path, options]: CreateArguments) =>
  run<LibraryContract.LibraryItem>(command.create, { path, options });

type PageArguments = [
  filter: LibraryContract.LibraryFilter,
  limit: number,
  offset: number,
];
export const getLibraryItemsPage = (
  ...[filter, limit, offset]: PageArguments
) =>
  run<LibraryContract.LibraryItemsPage>(command.page, {
    filter,
    limit,
    offset,
  });

export const updateLibraryItem = (
  id: string,
  patch: LibraryContract.LibraryItemPatch,
) => run<LibraryContract.LibraryItem>(command.update, { id, patch });

export const deleteLibraryItem = (id: string) => runForItem(command.delete, id);
export const cancelLibraryTranscription = (id: string) =>
  runForItem(command.cancel, id);
export const retryLibraryTranscription = (id: string) =>
  runForItem(command.retry, id);

type ExportArguments = [
  id: string,
  format: LibraryContract.ExportFormat,
  outputPath: string,
];
export const exportLibraryItemToPath = (
  ...[id, format, outputPath]: ExportArguments
) => run<void>(command.export, { id, format, outputPath });

export const getLibraryTags = () => run<string[]>(command.tags);

export const getLibraryTranslations = (itemId: string) =>
  run<LibraryContract.LibraryTranslation[]>(command.translations, { itemId });

export const translateLibraryItem = (itemId: string, language: string) =>
  run<LibraryContract.LibraryTranslation>(command.translate, {
    itemId,
    language,
  });

export const deleteLibraryTranslation = (itemId: string, language: string) =>
  run<void>(command.deleteTranslation, { itemId, language });
