import type { QueryClient } from "@tanstack/react-query";

import { getTranscriptions } from "../../data/transcription";
import type { TranscriptionRecord } from "../../types";

const TRANSCRIPTION_CACHE_ROOT = ["transcriptions"] as const;

export const transcriptionKeys = {
  all: TRANSCRIPTION_CACHE_ROOT,
  list: () => [...TRANSCRIPTION_CACHE_ROOT, "list"] as const,
};

export function transcriptionListQuery(enabled: boolean) {
  return {
    queryKey: transcriptionKeys.list(),
    queryFn: getTranscriptions,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  };
}

export async function removeCachedTranscription(
  queryClient: QueryClient,
  id: string,
) {
  const listKey = transcriptionKeys.list();
  await queryClient.cancelQueries({ queryKey: listKey });
  const snapshot = queryClient.getQueryData<TranscriptionRecord[]>(listKey);
  queryClient.setQueryData<TranscriptionRecord[]>(listKey, (records) =>
    records?.filter((record) => record.id !== id),
  );
  return snapshot;
}

export function restoreCachedTranscriptions(
  queryClient: QueryClient,
  snapshot: TranscriptionRecord[] | undefined,
) {
  if (snapshot !== undefined) {
    queryClient.setQueryData(transcriptionKeys.list(), snapshot);
  }
}
