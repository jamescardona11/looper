import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteTranscription } from "../../data/transcription";
import {
  removeCachedTranscription,
  restoreCachedTranscriptions,
} from "./transcription-query-policy";

export function useDeleteTranscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTranscription,
    onMutate: async (id) => ({
      snapshot: await removeCachedTranscription(queryClient, id),
    }),
    onError: (_error, _id, context) => {
      restoreCachedTranscriptions(queryClient, context?.snapshot);
    },
  });
}
