import { useMutation, useQuery } from "@tanstack/react-query";

import {
  retryLlmCleanup,
  undoLlmCleanup,
} from "../../data/transcription";
import { transcriptionListQuery } from "./transcription-query-policy";

export { transcriptionKeys } from "./transcription-query-policy";
export { useDeleteTranscription } from "./use-transcription-delete";
export { useRetryTranscription } from "./use-transcription-retry";
export { useTodayDictationStats } from "./use-today-dictation-stats";

export function useTranscriptionList(enabled = true) {
  return useQuery(transcriptionListQuery(enabled));
}

export function useRetryLlmCleanup() {
  return useMutation({ mutationFn: retryLlmCleanup });
}

export function useUndoLlmCleanup() {
  return useMutation({ mutationFn: undoLlmCleanup });
}
