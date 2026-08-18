import * as cliData from "../../data/cli";
import * as transcriptionData from "../../data/transcription";
import { formatTranscriptionSpeechModel } from "../../shared/lib/speechProviders";
import type { ModelStatus, SpeechModel } from "../../types";

const modelKey = (...segments: string[]) => ["models", ...segments] as const;

export const modelKeys = Object.freeze({
  all: modelKey(),
  catalog: () => modelKey("catalog"),
  status: (model: string) => modelKey("status", model),
  speech: () => modelKey("speech"),
  cli: () => modelKey("cli"),
});

export function normalizeModelKeys(models: readonly string[]): string[] {
  const normalized = models.map((model) => model.trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function resolveSpeechModelLabel(
  models: SpeechModel[] | undefined,
  modelId: string | null | undefined,
): string | null {
  const candidate = modelId?.trim();
  if (!candidate) return null;

  const match = models?.find(
    (model) => model.id === candidate || model.key === candidate,
  );
  return match?.label ?? formatTranscriptionSpeechModel(candidate) ?? candidate;
}

type ModelStatusResult = Readonly<{
  data?: ModelStatus;
  isLoading: boolean;
  isFetching: boolean;
}>;

export function summarizeModelStatuses(
  models: readonly string[],
  results: readonly ModelStatusResult[],
) {
  const statusByModel = Object.fromEntries(
    models.flatMap((model, index) => {
      const status = results[index]?.data;
      return status ? [[model, status] as const] : [];
    }),
  );

  return {
    statusByModel,
    isLoading: results.some((result) => result.isLoading),
    isFetching: results.some((result) => result.isFetching),
  };
}

export const modelQueryOptions = {
  catalog: (enabled: boolean) => ({
    queryKey: modelKeys.catalog(),
    queryFn: transcriptionData.listModels,
    enabled,
  }),
  speech: (enabled: boolean) => ({
    queryKey: modelKeys.speech(),
    queryFn: transcriptionData.listSpeechModels,
    enabled,
  }),
  status: (model: string, enabled: boolean) => ({
    queryKey: modelKeys.status(model),
    queryFn: () => transcriptionData.checkModelStatus(model),
    enabled,
    staleTime: 1_000,
  }),
  cli: (enabled: boolean) => ({
    queryKey: modelKeys.cli(),
    queryFn: cliData.getCliInstallStatus,
    enabled,
    staleTime: 0,
  }),
};
