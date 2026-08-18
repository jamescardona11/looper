import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type MutationFunction,
  type QueryKey,
} from "@tanstack/react-query";
import * as libraryApi from "../../data/library";
import type {
  ExportFormat,
  LibraryFilter,
  LibraryImportOptions,
  LibraryItemsPage,
  LibraryItemPatch,
  YoutubeImportMetadata,
} from "../../types";
import { libraryKeys } from "./library-query-keys";
import { useLibraryEventSync } from "./use-library-event-sync";

type PathImport = { path: string; options: LibraryImportOptions };
type YoutubeImport = {
  metadata: YoutubeImportMetadata;
  options: LibraryImportOptions;
};
type ItemUpdate = { id: string; patch: LibraryItemPatch };
type ItemExport = { id: string; format: ExportFormat; outputPath: string };

function invalidatingHook<Data, Variables>(
  run: MutationFunction<Data, Variables>,
  affected: QueryKey = libraryKeys.all,
) {
  return function useCommand() {
    const client = useQueryClient();
    return useMutation({
      mutationFn: run,
      onSuccess: () => void client.invalidateQueries({ queryKey: affected }),
    });
  };
}

function mutationHook<Data, Variables>(run: MutationFunction<Data, Variables>) {
  return function useCommand() {
    return useMutation({ mutationFn: run });
  };
}

function queryHook<Data>(
  key: () => QueryKey,
  read: () => Promise<Data>,
  gcTime?: number,
) {
  return function useCommand(enabled: boolean = true) {
    return useQuery({ queryKey: key(), queryFn: read, enabled, gcTime });
  };
}

export function useLibraryItems(
  filter: LibraryFilter = {},
  enabled: boolean = true,
) {
  useLibraryEventSync(filter, enabled);
  return useInfiniteQuery({
    queryKey: libraryKeys.list(filter),
    queryFn: ({ pageParam = 0 }) =>
      libraryApi.getLibraryItemsPage(filter, 30, pageParam),
    enabled,
    gcTime: 60_000,
    initialPageParam: 0,
    getNextPageParam: nextPageOffset,
  });
}

function nextPageOffset(last: LibraryItemsPage, pages: LibraryItemsPage[]) {
  if (!last.has_more) return undefined;
  return pages.reduce((offset, page) => offset + page.items.length, 0);
}

export const useCreateLibraryItem = invalidatingHook(
  ({ path, options }: PathImport) =>
    libraryApi.createLibraryItem(path, options),
);

export const useLibraryWatchFolders = queryHook(
  libraryKeys.watchFolders,
  libraryApi.getLibraryWatchFolders,
);

export const useAddLibraryWatchFolder = invalidatingHook(
  ({ path, options }: PathImport) =>
    libraryApi.addLibraryWatchFolder(path, options),
);

export const useRemoveLibraryWatchFolder = invalidatingHook(
  libraryApi.removeLibraryWatchFolder,
  libraryKeys.watchFolders(),
);

export const useScanLibraryWatchFolders = invalidatingHook<number, void>(() =>
  libraryApi.scanLibraryWatchFoldersNow(),
);

export const useProbeLibraryYoutubeUrl = mutationHook(
  libraryApi.probeLibraryYoutubeUrl,
);

export const useCreateLibraryYoutubeItem = invalidatingHook(
  ({ metadata, options }: YoutubeImport) =>
    libraryApi.createLibraryYoutubeItem(metadata, options),
);

export const useUpdateLibraryItem = invalidatingHook(
  ({ id, patch }: ItemUpdate) => libraryApi.updateLibraryItem(id, patch),
);

export const useDeleteLibraryItem = invalidatingHook(
  libraryApi.deleteLibraryItem,
);

export const useCancelLibraryTranscription = invalidatingHook(
  libraryApi.cancelLibraryTranscription,
);

export const useRetryLibraryTranscription = invalidatingHook(
  libraryApi.retryLibraryTranscription,
);

export const useExportLibraryItem = mutationHook(
  ({ id, format, outputPath }: ItemExport) =>
    libraryApi.exportLibraryItemToPath(id, format, outputPath),
);

export const useLibraryTags = queryHook(
  libraryKeys.tags,
  libraryApi.getLibraryTags,
  60_000,
);
