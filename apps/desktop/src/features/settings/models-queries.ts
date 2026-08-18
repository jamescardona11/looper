import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as cliData from "../../data/cli";
import * as transcriptionData from "../../data/transcription";
import {
  modelKeys,
  modelQueryOptions,
  normalizeModelKeys,
  summarizeModelStatuses,
} from "./model-query-contracts";

export {
  modelKeys,
  normalizeModelKeys,
  resolveSpeechModelLabel,
} from "./model-query-contracts";

export function useModelCatalog(enabled = true) {
  return useQuery(modelQueryOptions.catalog(enabled));
}

export function useSpeechModels(enabled = true) {
  return useQuery(modelQueryOptions.speech(enabled));
}

export function useModelStatuses(models: readonly string[], enabled = true) {
  const uniqueModels = normalizeModelKeys(models);
  const queries = useQueries({
    queries: uniqueModels.map((model) =>
      modelQueryOptions.status(model, enabled),
    ),
  });
  return summarizeModelStatuses(uniqueModels, queries);
}

export function useCliInstallStatus(enabled = true) {
  return useQuery(modelQueryOptions.cli(enabled));
}

function useCliMutation(mutationFn: typeof cliData.installCli) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (status) => queryClient.setQueryData(modelKeys.cli(), status),
  });
}

export const useInstallCli = () => useCliMutation(cliData.installCli);
export const useRemoveCli = () => useCliMutation(cliData.removeCli);

export const useFetchLlmModels = () =>
  useMutation({ mutationFn: transcriptionData.fetchLlmModels });

export const useFetchRemoteSpeechModels = () =>
  useMutation({ mutationFn: transcriptionData.fetchRemoteSpeechModels });
