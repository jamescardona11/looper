import type { LibraryFilter } from "../../types";

const root = ["library"] as const;

export const libraryKeys = {
  all: root,
  list: (filter: LibraryFilter) => [...root, "list", filter] as const,
  tags: () => [...root, "tags"] as const,
  watchFolders: () => [...root, "watch-folders"] as const,
  meetingCapture: () => [...root, "meeting-capture"] as const,
  meetingDetails: (id: string) => [...root, "meeting-details", id] as const,
};

export function isLibraryListKey(queryKey: readonly unknown[]) {
  return queryKey[0] === root[0] && queryKey[1] === "list";
}
