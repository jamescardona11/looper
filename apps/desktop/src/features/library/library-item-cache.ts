import type { QueryClient } from "@tanstack/react-query";
import type {
  LibraryFilter,
  LibraryImportProgressPayload,
  LibraryItem,
  LibraryItemsPage,
  LibraryProgressPayload,
} from "../../types";
import { libraryKeys } from "./library-query-keys";

const progressableStates = new Set([
  "pending",
  "recording",
  "importing",
  "transcribing",
]);

const importLockedStates = new Set([
  "transcribing",
  "complete",
  "cancelling",
  "cancelled",
]);

type LibraryInfiniteData = {
  pages: LibraryItemsPage[];
  pageParams: number[];
};

export function patchLibraryItem(
  client: QueryClient,
  filter: LibraryFilter,
  id: string,
  update: (item: LibraryItem) => LibraryItem,
) {
  client.setQueryData<LibraryInfiniteData>(libraryKeys.list(filter), (cache) =>
    cache
      ? {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === id ? update(item) : item,
            ),
          })),
        }
      : cache,
  );
}

export function applyTranscriptionProgress(
  item: LibraryItem,
  event: LibraryProgressPayload,
): LibraryItem {
  if (!progressableStates.has(item.status.type)) return item;

  const reset = event.current_chunk === 0 && event.total_chunks === 0;
  const transcript = appendTranscript(item.transcript, event.chunk_text, reset);
  const segments = appendSegments(item.segments, event.chunk_segments, reset);

  return {
    ...item,
    status: { type: "transcribing", progress: event.progress },
    ...(transcript.changed ? { transcript: transcript.value } : {}),
    ...(segments.changed ? { segments: segments.value } : {}),
  };
}

export function applyImportProgress(
  item: LibraryItem,
  event: LibraryImportProgressPayload,
): LibraryItem {
  if (importLockedStates.has(item.status.type)) return item;
  return {
    ...item,
    status: { type: "importing", progress: event.progress },
  };
}

function appendTranscript(
  current: string | null | undefined,
  chunk: string | null | undefined,
  reset: boolean,
) {
  const usableChunk = chunk && chunk.trim().length > 0 ? chunk : null;
  if (!reset && !usableChunk)
    return { changed: false as const, value: current };
  const base = reset ? "" : (current ?? "");
  const separator = base.trim() && usableChunk ? " " : "";
  return {
    changed: true as const,
    value: usableChunk ? `${base}${separator}${usableChunk}` : base,
  };
}

function appendSegments(
  current: LibraryItem["segments"],
  chunk: LibraryProgressPayload["chunk_segments"],
  reset: boolean,
) {
  const hasChunk = Boolean(chunk?.length);
  if (!reset && !hasChunk) return { changed: false as const, value: current };
  return {
    changed: true as const,
    value: [...(reset ? [] : (current ?? [])), ...(chunk ?? [])],
  };
}
