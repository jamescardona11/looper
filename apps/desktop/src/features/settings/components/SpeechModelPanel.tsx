import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";

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

export type SpeechModelPanelProps = Record<"enabled", boolean> &
  Record<"provider", RemoteSpeechProvider> &
  Record<"endpoint" | "apiKey" | "model", string> &
  Record<"availableModels", string[]> &
  Record<"setEnabled", (next: boolean) => void> &
  Record<"setProvider", (next: RemoteSpeechProvider) => void> &
  Record<"setEndpoint" | "setApiKey" | "setModel", (next: string) => void> &
  Record<"fetchAvailableModels", () => void>;

const SpeechModelPanel = (props: SpeechModelPanelProps) => {
  const { t } = useLingui();
  const preset = getSpeechProviderPreset(props.provider);
  const selectedModel = props.model || "auto";
  const discovered = uniqueModelNames(props.availableModels);
  const modelOptions = [
    {
      value: "auto",
      label: t({
        id: "settings.speech_model.model.automatic",
        message: `Automatic (${preset?.defaultModel || "provider default"})`,
      }),
    },
    ...discovered.map((value) => ({ value, label: value })),
    ...(selectedModel !== "auto" && !discovered.includes(selectedModel)
      ? [{ value: selectedModel, label: selectedModel }]
      : []),
  ];
  const providerOptions = [
    {
      value: "custom",
      label: t({
        id: "settings.speech_model.provider.custom",
        message: `Custom`,
      }),
      description: t({
        id: "settings.speech_model.provider.custom.description",
        message: `Enter your own endpoint URL`,
      }),
    },
    {
      value: "_local_header",
      label: t({
        id: "settings.speech_model.provider.local",
        message: `Local`,
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
        message: `Cloud (API Key)`,
      }),
      isHeader: true,
    },
    ...CLOUD_SPEECH_PROVIDERS.map((candidate) => ({
      value: candidate.id,
      label: candidate.label,
      description: candidate.endpoint,
    })),
  ];
  const changeProvider = (next: RemoteSpeechProvider) => {
    props.setProvider(next);
    const nextPreset = getSpeechProviderPreset(next);
    if (!nextPreset) return;
    props.setEndpoint(nextPreset.endpoint);
    props.setModel("auto");
  };
  const configuration: ComponentProps<typeof ProviderConfigurationPanel> = {
    copy: {
      title: t({
        id: "settings.speech_model.title",
        message: `Remote Speech Provider`,
      }),
      description: t({
        id: "settings.speech_model.description",
        message: `Transcribe recordings through OpenAI-compatible cloud or self-hosted APIs.`,
      }),
      toggleAria: t({
        id: "settings.speech_model.toggle",
        message: `Use this provider for speech-to-text`,
      }),
      providerLabel: t({
        id: "settings.speech_model.provider",
        message: `Provider`,
      }),
      providerPlaceholder: t({
        id: "settings.speech_model.provider.select",
        message: `Select provider...`,
      }),
      providerSearch: t({
        id: "settings.speech_model.provider.search",
        message: `Search speech providers...`,
      }),
      endpointPlaceholder: t({
        id: "settings.speech_model.endpoint.placeholder",
        message: `https://your-speech-endpoint.com`,
      }),
      endpointAria: t({
        id: "settings.speech_model.endpoint.aria",
        message: `Remote speech endpoint URL`,
      }),
      apiKeyLabel: t({
        id: "settings.speech_model.api_key",
        message: `API Key`,
      }),
      apiKeyOptionalHint: t({
        id: "settings.speech_model.api_key.optional_hint",
        message: `(if required)`,
      }),
      apiKeyRequiredPlaceholder: t({
        id: "settings.speech_model.api_key.required",
        message: `Required`,
      }),
      apiKeyOptionalPlaceholder: t({
        id: "settings.speech_model.api_key.optional",
        message: `Optional`,
      }),
      apiKeyAria: t({
        id: "settings.speech_model.api_key.aria",
        message: `Remote speech API key`,
      }),
      modelLabel: t({ id: "settings.speech_model.model", message: `Model` }),
      modelPlaceholder: t({
        id: "settings.speech_model.model.placeholder",
        message: `Model (default: ${preset?.defaultModel || "auto"})`,
      }),
      modelSearch: t({
        id: "settings.speech_model.model.search",
        message: `Search available speech models...`,
      }),
    },
    enabled: props.enabled,
    onEnabledChange: props.setEnabled,
    provider: props.provider,
    onProviderChange: changeProvider,
    providerOptions,
    customProvider: "custom",
    endpoint: props.endpoint,
    onEndpointChange: props.setEndpoint,
    apiKey: props.apiKey,
    onApiKeyChange: props.setApiKey,
    apiKeyRequired: preset?.apiKeyRequired ?? false,
    model: selectedModel,
    onModelChange: props.setModel,
    modelOptions,
    onModelsOpen:
      preset && supportsSpeechProviderModelDiscovery(props.provider)
        ? props.fetchAvailableModels
        : undefined,
  };
  return <ProviderConfigurationPanel {...configuration} />;
};

export default SpeechModelPanel;
