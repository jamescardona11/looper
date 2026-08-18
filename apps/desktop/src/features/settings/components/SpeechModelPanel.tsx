import { useLingui } from "@lingui/react/macro";
import {
  CLOUD_SPEECH_PROVIDERS,
  LOCAL_SPEECH_PROVIDERS,
  getSpeechProviderPreset,
  supportsSpeechProviderModelDiscovery,
} from "../../../shared/lib/speechProviders";
import type { RemoteSpeechProvider } from "../../../types";
import ProviderConfigurationPanel, {
  uniqueModelNames,
} from "./ProviderConfigurationPanel";

type ModelChoice = { value: string; label: string };

const resolveModelChoices = (
  selectedModel: string,
  discoveredModels: string[],
  automaticLabel: string,
): ModelChoice[] => [
  { value: "auto", label: automaticLabel },
  ...discoveredModels.map((value) => ({ value, label: value })),
  ...(selectedModel !== "auto" && !discoveredModels.includes(selectedModel)
    ? [{ value: selectedModel, label: selectedModel }]
    : []),
];

type SpeechModelPanelProps = {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  provider: RemoteSpeechProvider;
  setProvider: (value: RemoteSpeechProvider) => void;
  endpoint: string;
  setEndpoint: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  availableModels: string[];
  fetchAvailableModels: () => void;
};

const SpeechModelPanel = ({
  enabled,
  setEnabled,
  provider,
  setProvider,
  endpoint,
  setEndpoint,
  apiKey,
  setApiKey,
  model,
  setModel,
  availableModels,
  fetchAvailableModels,
}: SpeechModelPanelProps) => {
  const { t } = useLingui();
  const preset = getSpeechProviderPreset(provider);
  const selectedModel = model || "auto";
  const discoveredModels = uniqueModelNames(availableModels);
  const modelOptions = resolveModelChoices(
    selectedModel,
    discoveredModels,
    t({
      id: "settings.speech_model.model.automatic",
      message: `Automatic (${preset?.defaultModel || "provider default"})`,
    }),
  );
  const providerOptions = [
    {
      value: "custom",
      label: t({
        id: "settings.speech_model.provider.custom",
        message: "Custom",
      }),
      description: t({
        id: "settings.speech_model.provider.custom.description",
        message: "Enter your own endpoint URL",
      }),
    },
    {
      value: "_local_header",
      label: t({
        id: "settings.speech_model.provider.local",
        message: "Local",
      }),
      isHeader: true,
    },
    ...LOCAL_SPEECH_PROVIDERS.map((candidate) => ({
      value: candidate.id,
      label: candidate.label,
      description: candidate.endpoint,
    })),
    {
      value: "_cloud_header",
      label: t({
        id: "settings.speech_model.provider.cloud",
        message: "Cloud (API Key)",
      }),
      isHeader: true,
    },
    ...CLOUD_SPEECH_PROVIDERS.map((candidate) => ({
      value: candidate.id,
      label: candidate.label,
      description: candidate.endpoint,
    })),
  ];

  return (
    <ProviderConfigurationPanel
      copy={{
        title: t({
          id: "settings.speech_model.title",
          message: "Remote Speech Provider",
        }),
        description: t({
          id: "settings.speech_model.description",
          message:
            "Transcribe recordings through OpenAI-compatible cloud or self-hosted APIs.",
        }),
        toggleAria: t({
          id: "settings.speech_model.toggle",
          message: "Use this provider for speech-to-text",
        }),
        providerLabel: t({
          id: "settings.speech_model.provider",
          message: "Provider",
        }),
        providerPlaceholder: t({
          id: "settings.speech_model.provider.select",
          message: "Select provider...",
        }),
        providerSearch: t({
          id: "settings.speech_model.provider.search",
          message: "Search speech providers...",
        }),
        endpointPlaceholder: t({
          id: "settings.speech_model.endpoint.placeholder",
          message: "https://your-speech-endpoint.com",
        }),
        endpointAria: t({
          id: "settings.speech_model.endpoint.aria",
          message: "Remote speech endpoint URL",
        }),
        apiKeyLabel: t({
          id: "settings.speech_model.api_key",
          message: "API Key",
        }),
        apiKeyOptionalHint: t({
          id: "settings.speech_model.api_key.optional_hint",
          message: "(if required)",
        }),
        apiKeyRequiredPlaceholder: t({
          id: "settings.speech_model.api_key.required",
          message: "Required",
        }),
        apiKeyOptionalPlaceholder: t({
          id: "settings.speech_model.api_key.optional",
          message: "Optional",
        }),
        apiKeyAria: t({
          id: "settings.speech_model.api_key.aria",
          message: "Remote speech API key",
        }),
        modelLabel: t({
          id: "settings.speech_model.model",
          message: "Model",
        }),
        modelPlaceholder: t({
          id: "settings.speech_model.model.placeholder",
          message: `Model (default: ${preset?.defaultModel || "auto"})`,
        }),
        modelSearch: t({
          id: "settings.speech_model.model.search",
          message: "Search available speech models...",
        }),
      }}
      enabled={enabled}
      onEnabledChange={setEnabled}
      provider={provider}
      onProviderChange={(nextProvider) => {
        setProvider(nextProvider);
        const nextPreset = getSpeechProviderPreset(nextProvider);
        if (!nextPreset) return;
        setEndpoint(nextPreset.endpoint);
        setModel("auto");
      }}
      providerOptions={providerOptions}
      customProvider="custom"
      endpoint={endpoint}
      onEndpointChange={setEndpoint}
      apiKey={apiKey}
      onApiKeyChange={setApiKey}
      apiKeyRequired={preset?.apiKeyRequired ?? false}
      model={selectedModel}
      onModelChange={setModel}
      modelOptions={modelOptions}
      onModelsOpen={
        preset && supportsSpeechProviderModelDiscovery(provider)
          ? fetchAvailableModels
          : undefined
      }
    />
  );
};

export default SpeechModelPanel;
