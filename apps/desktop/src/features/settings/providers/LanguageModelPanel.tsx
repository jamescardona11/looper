import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";

import {
  CLOUD_PROVIDERS,
  LOCAL_LLM_PROVIDER,
  LOCAL_PROVIDERS,
  getProviderPreset,
} from "../../../shared/lib/llmProviders";
import type { LlmProvider } from "../../../contracts";
import ProviderConfigurationPanel, {
  uniqueModelNames,
} from "./ProviderConfigurationPanel";

export type LanguageModelPanelProps = Record<"llmEnabled", boolean> &
  Record<"llmProvider", LlmProvider> &
  Record<"llmEndpoint" | "llmApiKey" | "llmModel", string> &
  Record<"availableModels", string[]> &
  Record<"setLlmEnabled", (next: boolean) => void> &
  Record<"setLlmProvider", (next: LlmProvider) => void> &
  Record<
    "setLlmEndpoint" | "setLlmApiKey" | "setLlmModel",
    (next: string) => void
  > &
  Record<"fetchAvailableModels", () => void>;

const LanguageModelPanel = (props: LanguageModelPanelProps) => {
  const { t } = useLingui();
  const preset = getProviderPreset(props.llmProvider);
  const discovered = uniqueModelNames(props.availableModels);
  const modelOptions = [
    ...discovered.map((value) => ({ value, label: value })),
    ...(props.llmModel && !discovered.includes(props.llmModel)
      ? [{ value: props.llmModel, label: props.llmModel }]
      : []),
  ];
  const providerOptions = [
    {
      value: "custom",
      label: t({
        id: "settings.language_model.provider.custom",
        message: `Custom`,
      }),
      description: t({
        id: "settings.language_model.provider.custom.description",
        message: `Enter your own endpoint URL`,
      }),
    },
    {
      value: "_local_header",
      label: t({
        id: "settings.language_model.provider.local",
        message: `Local`,
      }),
      isHeader: true,
    },
    ...LOCAL_PROVIDERS.flatMap((provider) =>
      provider.id === "custom"
        ? []
        : [
            {
              value: provider.id,
              label: provider.label,
              description:
                provider.id === LOCAL_LLM_PROVIDER
                  ? t({
                      id: "settings.language_model.provider.local_engine",
                      message: `Built in. No API key, nothing leaves this Mac.`,
                    })
                  : provider.endpoint,
            },
          ],
    ),
    {
      value: "_cloud_header",
      label: t({
        id: "settings.language_model.provider.cloud",
        message: `Cloud (API Key)`,
      }),
      isHeader: true,
    },
    ...CLOUD_PROVIDERS.map((provider) => ({
      value: provider.id,
      label: provider.label,
      description: provider.endpoint,
    })),
  ];
  const changeProvider = (next: LlmProvider) => {
    props.setLlmProvider(next);
    const nextPreset = getProviderPreset(next);
    if (!nextPreset) return;
    props.setLlmEndpoint(nextPreset.endpoint);
    props.setLlmModel(nextPreset.defaultModel);
  };
  const configuration: ComponentProps<typeof ProviderConfigurationPanel> = {
    copy: {
      title: t({
        id: "settings.language_model.title",
        message: `Writing Model Provider`,
      }),
      description: t({
        id: "settings.language_model.description",
        message: `Used by Cleanup, Edit Mode, and Personalization.`,
      }),
      toggleAria: t({
        id: "settings.language_model.toggle",
        message: `Use this provider for AI writing features`,
      }),
      providerLabel: t({
        id: "settings.language_model.provider",
        message: `Provider`,
      }),
      providerPlaceholder: t({
        id: "settings.language_model.provider.select",
        message: `Select provider...`,
      }),
      providerSearch: t({
        id: "settings.language_model.provider.search",
        message: `Search providers...`,
      }),
      endpointPlaceholder: t({
        id: "settings.language_model.endpoint.placeholder",
        message: `https://your-llm-endpoint.com`,
      }),
      endpointAria: t({
        id: "settings.language_model.endpoint.aria",
        message: `LLM Endpoint URL`,
      }),
      apiKeyLabel: t({
        id: "settings.language_model.api_key",
        message: `API Key`,
      }),
      apiKeyOptionalHint: t({
        id: "settings.language_model.api_key.optional_hint",
        message: `(if required)`,
      }),
      apiKeyRequiredPlaceholder: t({
        id: "settings.language_model.api_key.required",
        message: `Required`,
      }),
      apiKeyOptionalPlaceholder: t({
        id: "settings.language_model.api_key.optional",
        message: `Optional`,
      }),
      apiKeyAria: t({
        id: "settings.language_model.api_key.aria",
        message: `LLM API Key`,
      }),
      modelLabel: t({ id: "settings.language_model.model", message: `Model` }),
      modelPlaceholder: t({
        id: "settings.language_model.model.placeholder",
        message: `Model (default: ${preset?.defaultModel || "none"})`,
      }),
      modelSearch: t({
        id: "settings.language_model.model.search",
        message: `Search available models...`,
      }),
    },
    enabled: props.llmEnabled,
    onEnabledChange: props.setLlmEnabled,
    provider: props.llmProvider,
    onProviderChange: changeProvider,
    providerOptions,
    customProvider: "custom",
    endpoint: props.llmEndpoint,
    onEndpointChange: props.setLlmEndpoint,
    apiKey: props.llmApiKey,
    onApiKeyChange: props.setLlmApiKey,
    apiKeyRequired: preset?.apiKeyRequired ?? false,
    model: props.llmModel,
    onModelChange: props.setLlmModel,
    modelOptions,
    onModelsOpen: preset ? props.fetchAvailableModels : undefined,
  };
  return <ProviderConfigurationPanel {...configuration} />;
};

export default LanguageModelPanel;
