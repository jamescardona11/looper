import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as cliData from "../../data/cli";
import * as transcriptionData from "../../data/transcription";
import { formatTranscriptionSpeechModel } from "../../shared/lib/speechProviders";
import type { ModelStatus, SpeechModel } from "../../types";

const MODEL_QUERY_ROOT = ["models"] as const;

export const modelKeys = {
  all: MODEL_QUERY_ROOT,
  catalog: () => [...MODEL_QUERY_ROOT, "catalog"] as const,
  status: (model: string) => [...MODEL_QUERY_ROOT, "status", model] as const,
  speech: () => [...MODEL_QUERY_ROOT, "speech"] as const,
  cli: () => [...MODEL_QUERY_ROOT, "cli"] as const,
};

export function normalizeModelKeys(models: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const model of models) {
    const normalized = model.trim();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

export function resolveSpeechModelLabel(
  models: SpeechModel[] | undefined,
  modelId: string | null | undefined,
): string | null {
  const normalized = modelId?.trim();
  if (!normalized) return null;

  for (const model of models ?? []) {
    if (model.id === normalized || model.key === normalized) return model.label;
  }
  return formatTranscriptionSpeechModel(normalized) ?? normalized;
}

export function useModelCatalog(enabled = true) {
  return useQuery({
    queryKey: modelKeys.catalog(),
    queryFn: transcriptionData.listModels,
    enabled,
  });
}

export function useSpeechModels(enabled = true) {
  return useQuery({
    queryKey: modelKeys.speech(),
    queryFn: transcriptionData.listSpeechModels,
    enabled,
  });
}

export function useModelStatuses(models: readonly string[], enabled = true) {
  const uniqueModels = normalizeModelKeys(models);
  const queries = useQueries({
    queries: uniqueModels.map((model) => ({
      queryKey: modelKeys.status(model),
      queryFn: () => transcriptionData.checkModelStatus(model),
      enabled,
      staleTime: 1_000,
    })),
  });

  const statusByModel: Record<string, ModelStatus> = {};
  queries.forEach((query, index) => {
    const model = uniqueModels[index];
    if (model && query.data) statusByModel[model] = query.data;
  });

  return {
    statusByModel,
    isLoading: queries.some(({ isLoading }) => isLoading),
    isFetching: queries.some(({ isFetching }) => isFetching),
  };
}

export function useCliInstallStatus(enabled = true) {
  return useQuery({
    queryKey: modelKeys.cli(),
    queryFn: cliData.getCliInstallStatus,
    enabled,
    staleTime: 0,
  });
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
