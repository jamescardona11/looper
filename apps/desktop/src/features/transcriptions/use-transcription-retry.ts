import { useMutation } from "@tanstack/react-query";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

import {
  cancelRetryTranscription,
  retryTranscription,
  subscribeTranscriptionEvents,
} from "../../data/transcription";
import { safeUnlisten } from "../../shared/lib/safeUnlisten";

function withoutId(ids: string[], removedId: string) {
  return ids.filter((id) => id !== removedId);
}

export function useRetryTranscription(enabled = true) {
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const listening = enabled || retryingIds.length > 0;

  useEffect(() => {
    if (!listening) return;

    let disposed = false;
    const disposeCallbacks: UnlistenFn[] = [];
    const clearRetries = () => {
      if (!disposed) {
        setRetryingIds((ids) => (ids.length === 0 ? ids : []));
      }
    };

    for (const subscription of subscribeTranscriptionEvents({
      onComplete: clearRetries,
      onError: clearRetries,
    })) {
      subscription.then((dispose) => {
        if (disposed) safeUnlisten(dispose);
        else disposeCallbacks.push(dispose);
      });
    }

    return () => {
      disposed = true;
      disposeCallbacks.forEach(safeUnlisten);
    };
  }, [listening]);

  const retry = useMutation({
    mutationFn: retryTranscription,
    onMutate: (id) => {
      setRetryingIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    },
    onError: (_error, id) => {
      setRetryingIds((ids) => withoutId(ids, id));
    },
  });
  const cancelRetry = useMutation({
    mutationFn: cancelRetryTranscription,
    onSettled: (_data, _error, id) => {
      setRetryingIds((ids) => withoutId(ids, id));
    },
  });

  return { retry, cancelRetry, retryingIds };
}
