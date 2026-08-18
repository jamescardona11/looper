import { useLingui } from "@lingui/react/macro";
import {
  CLOUD_PROVIDERS,
  LOCAL_LLM_PROVIDER,
  LOCAL_PROVIDERS,
  getProviderPreset,
} from "../../../shared/lib/llmProviders";
import type { LlmProvider } from "../../../types";
import ProviderConfigurationPanel, {
  uniqueModelNames,
} from "./ProviderConfigurationPanel";

type LanguageModelPanelProps = {
  llmEnabled: boolean;
  setLlmEnabled: (value: boolean) => void;
  llmProvider: LlmProvider;
  setLlmProvider: (value: LlmProvider) => void;
  llmEndpoint: string;
  setLlmEndpoint: (value: string) => void;
  llmApiKey: string;
  setLlmApiKey: (value: string) => void;
  llmModel: string;
  setLlmModel: (value: string) => void;
  availableModels: string[];
  fetchAvailableModels: () => void;
};

const LanguageModelPanel = ({
  llmEnabled,
  setLlmEnabled,
  llmProvider,
  setLlmProvider,
  llmEndpoint,
  setLlmEndpoint,
  llmApiKey,
  setLlmApiKey,
  llmModel,
  setLlmModel,
  availableModels,
  fetchAvailableModels,
}: LanguageModelPanelProps) => {
  const { t } = useLingui();
  const preset = getProviderPreset(llmProvider);
  const models = uniqueModelNames(availableModels);
  const modelOptions = [
    ...models.map((value) => ({ value, label: value })),
    ...(llmModel && !models.includes(llmModel)
      ? [{ value: llmModel, label: llmModel }]
      : []),
  ];
  const providerOptions = [
    {
      value: "custom",
      label: t({
        id: "settings.language_model.provider.custom",
        message: "Custom",
      }),
      description: t({
        id: "settings.language_model.provider.custom.description",
        message: "Enter your own endpoint URL",
      }),
    },
    {
      value: "_local_header",
      label: t({
        id: "settings.language_model.provider.local",
        message: "Local",
      }),
      isHeader: true,
    },
    ...LOCAL_PROVIDERS.filter(({ id }) => id !== "custom").map((provider) => ({
      value: provider.id,
      label: provider.label,
      description:
        provider.id === LOCAL_LLM_PROVIDER
          ? t({
              id: "settings.language_model.provider.local_engine",
              message: "Built in. No API key, nothing leaves this Mac.",
            })
          : provider.endpoint,
    })),
    {
      value: "_cloud_header",
      label: t({
        id: "settings.language_model.provider.cloud",
        message: "Cloud (API Key)",
      }),
      isHeader: true,
    },
    ...CLOUD_PROVIDERS.map((provider) => ({
      value: provider.id,
      label: provider.label,
      description: provider.endpoint,
    })),
  ];

  return (
    <ProviderConfigurationPanel
      copy={{
        title: t({
          id: "settings.language_model.title",
          message: "Writing Model Provider",
        }),
        description: t({
          id: "settings.language_model.description",
          message: "Used by Cleanup, Edit Mode, and Personalization.",
        }),
        toggleAria: t({
          id: "settings.language_model.toggle",
          message: "Use this provider for AI writing features",
        }),
        providerLabel: t({
          id: "settings.language_model.provider",
          message: "Provider",
        }),
        providerPlaceholder: t({
          id: "settings.language_model.provider.select",
          message: "Select provider...",
        }),
        providerSearch: t({
          id: "settings.language_model.provider.search",
          message: "Search providers...",
        }),
        endpointPlaceholder: t({
          id: "settings.language_model.endpoint.placeholder",
          message: "https://your-llm-endpoint.com",
        }),
        endpointAria: t({
          id: "settings.language_model.endpoint.aria",
          message: "LLM Endpoint URL",
        }),
        apiKeyLabel: t({
          id: "settings.language_model.api_key",
          message: "API Key",
        }),
        apiKeyOptionalHint: t({
          id: "settings.language_model.api_key.optional_hint",
          message: "(if required)",
        }),
        apiKeyRequiredPlaceholder: t({
          id: "settings.language_model.api_key.required",
          message: "Required",
        }),
        apiKeyOptionalPlaceholder: t({
          id: "settings.language_model.api_key.optional",
          message: "Optional",
        }),
        apiKeyAria: t({
          id: "settings.language_model.api_key.aria",
          message: "LLM API Key",
        }),
        modelLabel: t({
          id: "settings.language_model.model",
          message: "Model",
        }),
        modelPlaceholder: t({
          id: "settings.language_model.model.placeholder",
          message: `Model (default: ${preset?.defaultModel || "none"})`,
        }),
        modelSearch: t({
          id: "settings.language_model.model.search",
          message: "Search available models...",
        }),
      }}
      enabled={llmEnabled}
      onEnabledChange={setLlmEnabled}
      provider={llmProvider}
      onProviderChange={(nextProvider) => {
        setLlmProvider(nextProvider);
        const nextPreset = getProviderPreset(nextProvider);
        if (!nextPreset) return;
        setLlmEndpoint(nextPreset.endpoint);
        setLlmModel(nextPreset.defaultModel);
      }}
      providerOptions={providerOptions}
      customProvider="custom"
      endpoint={llmEndpoint}
      onEndpointChange={setLlmEndpoint}
      apiKey={llmApiKey}
      onApiKeyChange={setLlmApiKey}
      apiKeyRequired={preset?.apiKeyRequired ?? false}
      model={llmModel}
      onModelChange={setLlmModel}
      modelOptions={modelOptions}
      onModelsOpen={preset ? fetchAvailableModels : undefined}
    />
  );
};

export default LanguageModelPanel;
