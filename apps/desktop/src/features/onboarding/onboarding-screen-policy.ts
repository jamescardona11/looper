import type { QueryFunction } from "@tanstack/react-query";
import type { PurchaseTier } from "../license/purchaseConfig";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
  StoredSettings,
} from "../../contracts";
import { LOCAL_LLM_MODEL_ID } from "../../data/models/local-llm";
import { activityToDownloadEvent } from "../settings/models/modelDownloadActivity";
import {
  pickDefaultOnboardingModel,
  pickOnboardingModels,
  pickRecommendedOnboardingModel,
  resolveOnboardingLanguage,
} from "./modelSelection";

type CompletionSettingsInput = {
  latest: StoredSettings;
  smartShortcut: string;
  transcriptionMode: string;
  localModel: string;
  localModelInfo: ModelInfo | null;
  autoLaunchEnabled: boolean;
  systemLanguage: string;
  meetingAiProvider: "local" | "none";
};

const shortcutSettings = (smartShortcut: string) => {
  const holdShortcut = "Control+Shift+Space";
  const toggleShortcut = "Control+Alt+Space";
  return {
    smartShortcut,
    smartEnabled: true,
    holdShortcut,
    holdEnabled: false,
    toggleShortcut,
    toggleEnabled: false,
    shortcutBindings: {
      smart: [
        { shortcut: smartShortcut, temporary: false, cleanup_enabled: false },
      ],
      hold: [
        { shortcut: holdShortcut, temporary: false, cleanup_enabled: false },
      ],
      toggle: [
        { shortcut: toggleShortcut, temporary: false, cleanup_enabled: false },
      ],
    },
  };
};

export function buildCompletedOnboardingSettings({
  latest,
  smartShortcut,
  transcriptionMode,
  localModel,
  localModelInfo,
  autoLaunchEnabled,
  systemLanguage,
  meetingAiProvider,
}: CompletionSettingsInput) {
  const appLocale = latest.app_locale ?? "system";
  const speechSettings = {
    transcriptionMode,
    localModel,
    remoteSpeechEnabled: false,
    remoteSpeechProvider: latest.remote_speech_provider ?? "custom",
    remoteSpeechEndpoint: latest.remote_speech_endpoint ?? "",
    remoteSpeechApiKey: latest.remote_speech_api_key ?? "",
    remoteSpeechModel: latest.remote_speech_model ?? "",
    microphoneDevice: latest.microphone_device ?? null,
    language: resolveOnboardingLanguage(
      localModelInfo,
      latest.language ?? "",
      appLocale === "system" ? systemLanguage : appLocale,
    ),
  };
  const intelligenceSettings = {
    llmEnabled: false,
    cleanupEnabled: false,
    llmProvider: latest.llm_provider ?? "none",
    llmEndpoint: latest.llm_endpoint ?? "",
    llmApiKey: latest.llm_api_key ?? "",
    llmModel: latest.llm_model ?? "",
    meetingAiProvider,
    localLlmModel: LOCAL_LLM_MODEL_ID,
    editModeEnabled: false,
    autoDictionaryEnabled: false,
  };
  return {
    ...shortcutSettings(smartShortcut),
    ...speechSettings,
    ...intelligenceSettings,
    appLocale,
    themeMode: latest.theme_mode ?? "system",
    mediaAction: "pause",
    autoUpdateEnabled: true,
    autoLaunchEnabled,
    startInBackground: latest.start_in_background ?? false,
    autoDeleteTarget: latest.auto_delete_target ?? "transcripts",
    autoDeleteDuration: latest.auto_delete_duration ?? "never",
    analyticsEnabled: latest.analytics_enabled ?? true,
  };
}

export function resolveOnboardingModels(
  catalog: ModelInfo[] | undefined,
  importedKey: string,
  persistedKey: string,
) {
  const allModels = catalog ?? [];
  const preferred = pickOnboardingModels(allModels);
  const imported = importedKey
    ? allModels.find(({ key }) => key === importedKey)
    : undefined;
  const onboardingModels =
    imported && !preferred.some(({ key }) => key === imported.key)
      ? [...preferred, imported]
      : preferred;
  const recommended = pickRecommendedOnboardingModel(allModels);
  const selectedKey =
    importedKey ||
    recommended?.key ||
    pickDefaultOnboardingModel(onboardingModels, persistedKey);
  const selectedInfo =
    onboardingModels.find(({ key }) => key === selectedKey) ??
    allModels.find(({ key }) => key === selectedKey) ??
    recommended ??
    null;
  const statusKeys = Array.from(
    new Set(
      [...onboardingModels.map(({ key }) => key), selectedKey].filter(Boolean),
    ),
  );
  return { onboardingModels, selectedKey, selectedInfo, statusKeys };
}

export function buildModelDisplayStates(
  catalog: ModelInfo[] | undefined,
  statuses: Record<string, ModelStatus>,
  activities: Record<string, Parameters<typeof activityToDownloadEvent>[0]>,
) {
  const stateFor = (key: string): DownloadEvent => {
    const activity = activityToDownloadEvent(activities[key]);
    if (activity && activity.status !== "complete") return activity;
    if (statuses[key]?.installed) return { status: "complete", percent: 100 };
    return activity ?? { status: "idle", percent: 0 };
  };
  return (catalog ?? []).reduce<Record<string, DownloadEvent>>(
    (result, model) => {
      result[model.key] = stateFor(model.key);
      return result;
    },
    {},
  );
}

export const selectedModelIsReady = (
  selectedKey: string,
  statuses: Record<string, ModelStatus>,
  displayStates: Record<string, DownloadEvent>,
) =>
  Boolean(
    selectedKey &&
    (statuses[selectedKey]?.installed ||
      displayStates[selectedKey]?.status === "complete"),
  );

export function modelDownloadRequest(
  catalog: ModelInfo[] | undefined,
  modelKey: string,
  includeAneOverride?: boolean,
) {
  const model = catalog?.find(({ key }) => key === modelKey);
  const includeAne =
    includeAneOverride ?? typeof model?.ane_size_mb === "number";
  const totalMegabytes =
    (model?.size_mb ?? 0) + (includeAne ? (model?.ane_size_mb ?? 0) : 0);
  return {
    model: modelKey,
    label: model?.label ?? modelKey,
    totalBytes: Math.round(totalMegabytes * 1_000_000),
    ane: includeAne,
  };
}

export function permissionQueryOptions(
  key: readonly string[],
  queryFn: QueryFunction<boolean>,
  required: boolean,
  permissionsVisible: boolean,
) {
  return {
    queryKey: key,
    queryFn,
    enabled: required,
    refetchOnWindowFocus: permissionsVisible ? ("always" as const) : false,
    refetchInterval: (query: { state: { data: unknown } }) =>
      permissionsVisible && query.state.data !== true ? 2_000 : false,
    staleTime: 0,
    retry: false,
  };
}

export const permissionPresentation = (
  required: boolean,
  granted: boolean | undefined,
  pending: boolean,
  requesting: boolean,
) => ({
  granted: required ? granted === true : true,
  checking: required && (pending || requesting),
});

export const licenseActivationError = (error: unknown) =>
  error instanceof Error ? error.message : error ? String(error) : null;

export const missingCheckoutMessage = (tier: PurchaseTier) =>
  `${tier === "commercial" ? "Commercial" : "Personal"} checkout link is not configured for this build.`;
