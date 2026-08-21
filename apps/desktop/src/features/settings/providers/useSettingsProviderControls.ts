import { msg } from "@lingui/core/macro";
import { useCallback, useEffect, useMemo } from "react";

import { i18n } from "../../../i18n";
import { resolvedLlmEndpoint } from "../../../shared/lib/llmProviders";
import { resolvedSpeechEndpoint } from "../../../shared/lib/speechProviders";
import type {
  LlmProvider,
  ModelInfo,
  RemoteSpeechProvider,
} from "../../../contracts/index";
import { useModelDiscoverySession } from "../models/useModelDiscoverySession";
import {
  useFetchLlmModels,
  useFetchRemoteSpeechModels,
} from "../models/models-queries";
import {
  deriveSettingsProviderState,
  type LanguageGuidanceKind,
} from "../preferences/settings-provider-model";
import type { SettingsDraft } from "../preferences/useSettingsDraft";

type ProviderActions = {
  setLanguage: (value: string) => void;
  setLlmProvider: (value: LlmProvider) => void;
  setLlmEndpoint: (value: string) => void;
  setLlmApiKey: (value: string) => void;
  setLlmModel: (value: string) => void;
  setRemoteSpeechProvider: (value: RemoteSpeechProvider) => void;
  setRemoteSpeechEndpoint: (value: string) => void;
  setRemoteSpeechApiKey: (value: string) => void;
  setRemoteSpeechModel: (value: string) => void;
};

type ProviderControlsOptions = {
  enabled: boolean;
  loading: boolean;
  licenseGateActive: boolean;
  draft: SettingsDraft;
  modelCatalog: ModelInfo[];
  actions: ProviderActions;
  errorSourceTab: string | null;
  clearError: () => void;
  showError: (message: string) => void;
};

export function useSettingsProviderControls({
  enabled,
  loading,
  licenseGateActive,
  draft,
  modelCatalog,
  actions,
  errorSourceTab,
  clearError,
  showError,
}: ProviderControlsOptions) {
  const writingDiscovery = useModelDiscoverySession();
  const speechDiscovery = useModelDiscoverySession();
  const { mutateAsync: fetchWritingModels } = useFetchLlmModels();
  const { mutateAsync: fetchSpeechModels } = useFetchRemoteSpeechModels();
  const state = useMemo(
    () =>
      deriveSettingsProviderState({
        draft,
        modelCatalog,
        licenseGateActive,
        systemLocale: navigator.language,
        unsupportedLanguageLabel: i18n._(
          msg({
            id: "transcription.language.unsupported",
            message: "Unsupported",
          }),
        ),
        unsupportedLanguageDescription: i18n._(
          msg({
            id: "transcription.language.unsupported_description",
            message: "Choose a compatible model to enable these.",
          }),
        ),
      }),
    [draft, licenseGateActive, modelCatalog],
  );

  useEffect(() => {
    if (!enabled || loading || draft.language === state.language) return;
    actions.setLanguage(state.language);
  }, [actions, draft.language, enabled, loading, state.language]);

  const setLlmProvider = useCallback(
    (provider: LlmProvider) => {
      writingDiscovery.reset();
      actions.setLlmModel("");
      actions.setLlmProvider(provider);
    },
    [actions, writingDiscovery],
  );
  const setLlmEndpoint = useCallback(
    (endpoint: string) => {
      writingDiscovery.reset();
      actions.setLlmModel("");
      actions.setLlmEndpoint(endpoint);
    },
    [actions, writingDiscovery],
  );
  const setLlmApiKey = useCallback(
    (apiKey: string) => {
      writingDiscovery.reset();
      actions.setLlmApiKey(apiKey);
    },
    [actions, writingDiscovery],
  );
  const setRemoteSpeechProvider = useCallback(
    (provider: RemoteSpeechProvider) => {
      speechDiscovery.reset();
      actions.setRemoteSpeechProvider(provider);
      actions.setRemoteSpeechModel("auto");
    },
    [actions, speechDiscovery],
  );
  const setRemoteSpeechEndpoint = useCallback(
    (endpoint: string) => {
      speechDiscovery.reset();
      actions.setRemoteSpeechEndpoint(endpoint);
      actions.setRemoteSpeechModel("auto");
    },
    [actions, speechDiscovery],
  );
  const setRemoteSpeechApiKey = useCallback(
    (apiKey: string) => {
      speechDiscovery.reset();
      actions.setRemoteSpeechApiKey(apiKey);
      actions.setRemoteSpeechModel("auto");
    },
    [actions, speechDiscovery],
  );

  const discoverWritingModels = useCallback(async () => {
    const request = writingDiscovery.begin();
    try {
      const models = await fetchWritingModels({
        endpoint: resolvedLlmEndpoint(draft.llmProvider, draft.llmEndpoint),
        apiKey: draft.llmApiKey,
      });
      if (!writingDiscovery.succeed(request, models)) return;
      if (errorSourceTab === "providers") clearError();
    } catch (error) {
      if (!writingDiscovery.fail(request)) return;
      showError(`Failed to load writing models: ${error}`);
    }
  }, [
    clearError,
    draft.llmApiKey,
    draft.llmEndpoint,
    draft.llmProvider,
    errorSourceTab,
    fetchWritingModels,
    showError,
    writingDiscovery,
  ]);

  const discoverSpeechModels = useCallback(async () => {
    const request = speechDiscovery.begin();
    try {
      const models = await fetchSpeechModels({
        endpoint: resolvedSpeechEndpoint(
          draft.remoteSpeechProvider,
          draft.remoteSpeechEndpoint,
        ),
        apiKey: draft.remoteSpeechApiKey,
      });
      if (!speechDiscovery.succeed(request, models)) return;
      if (errorSourceTab === "providers") clearError();
    } catch (error) {
      if (!speechDiscovery.fail(request)) return;
      showError(`Failed to load speech models: ${error}`);
    }
  }, [
    clearError,
    draft.remoteSpeechApiKey,
    draft.remoteSpeechEndpoint,
    draft.remoteSpeechProvider,
    errorSourceTab,
    fetchSpeechModels,
    showError,
    speechDiscovery,
  ]);

  return {
    ...state,
    languageGuidance: languageGuidanceMessage(state.languageGuidance),
    setLlmProvider,
    setLlmEndpoint,
    setLlmApiKey,
    setRemoteSpeechProvider,
    setRemoteSpeechEndpoint,
    setRemoteSpeechApiKey,
    availableModels: writingDiscovery.models,
    fetchAvailableModels: discoverWritingModels,
    availableSpeechModels: speechDiscovery.models,
    fetchAvailableSpeechModels: discoverSpeechModels,
  };
}

function languageGuidanceMessage(kind: LanguageGuidanceKind) {
  const messages = {
    remote: msg({
      id: "settings.general.language_guidance.remote",
      message:
        "Selecting a language sends it to your configured provider as a recognition hint.",
    }),
    auto: msg({
      id: "settings.general.language_guidance.auto_detect",
      message:
        "This model detects the spoken language automatically. Your selection only affects spoken formatting commands.",
    }),
    required: msg({
      id: "settings.general.language_guidance.required",
      message:
        "Choose the language you speak. This model needs it to transcribe.",
    }),
  } as const;
  return i18n._(messages[kind]);
}
