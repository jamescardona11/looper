import {
  getSpeechProviderPreset,
  resolvedSpeechModel,
} from "../../../../shared/lib/speechProviders";
import { sortInstalledModels } from "../../../../shared/lib/modelStats";
import type {
  ModelInfo,
  ModelStatus,
  RemoteSpeechProvider,
  TranscriptionMode,
} from "../../../../types";

export function selectLocalModel(
  catalog: ModelInfo[],
  configuredKey: string,
  status: Record<string, ModelStatus>,
): ModelInfo | null {
  const configured = catalog.find(({ key }) => key === configuredKey);
  if (configured) return configured;

  const installed = catalog.filter(({ key }) => status[key]?.installed);
  const downloadable = installed.find((model) => model.downloadable);
  if (downloadable) return downloadable;
  if (installed[0]) return installed[0];

  const recommended = catalog.find(
    (model) =>
      model.downloadable &&
      model.tags.some((tag) => tag.trim().toLowerCase() === "recommended"),
  );
  if (recommended) return recommended;

  return (
    catalog
      .filter((model) => model.downloadable)
      .sort((left, right) => left.size_mb - right.size_mb)[0] ?? null
  );
}

export function installedModelCatalog(
  catalog: ModelInfo[],
  status: Record<string, ModelStatus>,
): ModelInfo[] {
  return sortInstalledModels(
    catalog.filter((model) => status[model.key]?.installed),
  );
}

export type CloudModelSelection = {
  active: boolean;
  providerLabel: string | null;
  modelLabel: string | null;
  settingsTarget: "general" | "providers";
};

export function cloudModelSelection(args: {
  transcriptionMode: TranscriptionMode;
  remoteEnabled: boolean;
  remoteProvider: RemoteSpeechProvider;
  remoteModel: string;
}): CloudModelSelection {
  if (args.transcriptionMode === "cloud") {
    return {
      active: true,
      providerLabel: "Looper Cloud",
      modelLabel: "AssemblyAI Universal Streaming",
      settingsTarget: "general",
    };
  }
  if (!args.remoteEnabled) {
    return {
      active: false,
      providerLabel: null,
      modelLabel: null,
      settingsTarget: "providers",
    };
  }
  return {
    active: true,
    providerLabel: getSpeechProviderPreset(args.remoteProvider)?.label ?? null,
    modelLabel:
      resolvedSpeechModel(args.remoteProvider, args.remoteModel) ?? null,
    settingsTarget: "providers",
  };
}
