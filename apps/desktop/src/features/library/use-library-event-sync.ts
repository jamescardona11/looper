import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as libraryApi from "../../data/library";
import type { LibraryFilter } from "../../types";
import {
  applyImportProgress,
  applyTranscriptionProgress,
  patchLibraryItem,
} from "./library-item-cache";
import { libraryKeys } from "./library-query-keys";

export function useLibraryEventSync(filter: LibraryFilter, enabled: boolean) {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let release: (() => void) | undefined;
    const invalidate = () =>
      void client.invalidateQueries({ queryKey: libraryKeys.all });

    void libraryApi
      .subscribeLibraryEvents({
        transcriptionProgress: (event) => {
          if (!disposed) {
            patchLibraryItem(client, filter, event.id, (item) =>
              applyTranscriptionProgress(item, event),
            );
          }
        },
        transcriptionComplete: ({ id }) => {
          if (disposed) return;
          if (id) {
            patchLibraryItem(client, filter, id, (item) => ({
              ...item,
              status: { type: "complete" },
            }));
          }
          invalidate();
        },
        transcriptionError: ({ id, message, cancelled }) => {
          if (disposed) return;
          patchLibraryItem(client, filter, id, (item) => ({
            ...item,
            status: cancelled
              ? { type: "cancelled" }
              : { type: "error", message },
          }));
          invalidate();
        },
        importProgress: (event) => {
          if (!disposed) {
            patchLibraryItem(client, filter, event.id, (item) =>
              applyImportProgress(item, event),
            );
          }
        },
        watchImported: () => {
          if (!disposed) invalidate();
        },
      })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else release = unsubscribe;
      });

    return () => {
      disposed = true;
      release?.();
    };
  }, [client, enabled, filter]);
}
