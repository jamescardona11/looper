import remoteSpeechDefaults from "./remote-speech-defaults.json";

export type RemoteSpeechProvider = string;

export type SpeechProviderCompatibility =
  "direct-openai-compatible" | "openai-compatible-proxy";

export type SpeechProviderPreset = {
  id: RemoteSpeechProvider;
  label: string;
  endpoint: string;
  defaultModel: string;
  apiKeyRequired: boolean;
  compatibility: SpeechProviderCompatibility;
  supportsModelDiscovery: boolean;
  notes?: string;
};

type SpeechSeed = {
  label: string;
  endpoint: string;
  defaultModel: string;
  proxy?: boolean;
  notes?: string;
};

const SPEECH_SEEDS: Record<string, SpeechSeed> = {
  custom: { label: "Custom", endpoint: "", defaultModel: "auto" },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    defaultModel: remoteSpeechDefaults.openai,
  },
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    defaultModel: remoteSpeechDefaults.groq,
  },
  mistral: {
    label: "Mistral",
    endpoint: "https://api.mistral.ai/v1",
    defaultModel: remoteSpeechDefaults.mistral,
  },
  fireworks: {
    label: "Fireworks AI",
    endpoint: "https://audio-prod.api.fireworks.ai/v1",
    defaultModel: remoteSpeechDefaults.fireworks,
    notes: "Uses the Fireworks audio API base, not the normal inference base.",
  },
  openrouter: {
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    defaultModel: remoteSpeechDefaults.openrouter,
  },
  deepgram: {
    label: "Deepgram",
    endpoint: "http://localhost:4000/v1",
    defaultModel: remoteSpeechDefaults.deepgram,
    proxy: true,
    notes: "Use through an OpenAI-compatible gateway or proxy.",
  },
  elevenlabs: {
    label: "ElevenLabs",
    endpoint: "http://localhost:4000/v1",
    defaultModel: remoteSpeechDefaults.elevenlabs,
    proxy: true,
    notes: "Use through an OpenAI-compatible gateway or proxy.",
  },
};

const SPEECH_PROVIDER_PRESETS: SpeechProviderPreset[] = Object.entries(
  SPEECH_SEEDS,
).map(([id, seed]) => ({
  id,
  label: seed.label,
  endpoint: seed.endpoint,
  defaultModel: seed.defaultModel,
  apiKeyRequired: id !== "custom",
  compatibility: seed.proxy
    ? "openai-compatible-proxy"
    : "direct-openai-compatible",
  supportsModelDiscovery: true,
  ...(seed.notes ? { notes: seed.notes } : {}),
}));
const SPEECH_PRESET_BY_ID = new Map(
  SPEECH_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
);

export const SPEECH_PROVIDERS = SPEECH_PROVIDER_PRESETS.filter(
  (provider) => provider.id !== "custom",
);
export const LOCAL_SPEECH_PROVIDERS = SPEECH_PROVIDERS.filter(
  (provider) => !provider.apiKeyRequired,
);
export const CLOUD_SPEECH_PROVIDERS = SPEECH_PROVIDERS.filter(
  (provider) => provider.apiKeyRequired,
);

export function getSpeechProviderPreset(id: RemoteSpeechProvider) {
  return SPEECH_PRESET_BY_ID.get(id);
}

export function supportsSpeechProviderModelDiscovery(id: RemoteSpeechProvider) {
  return getSpeechProviderPreset(id)?.supportsModelDiscovery ?? false;
}

export function resolvedSpeechEndpoint(
  provider: RemoteSpeechProvider,
  endpoint: string,
) {
  return endpoint.trim() || getSpeechProviderPreset(provider)?.endpoint || "";
}

export function resolvedSpeechModel(
  provider: RemoteSpeechProvider,
  model: string,
): string | undefined {
  const selected = model.trim();
  if (selected && selected.toLowerCase() !== "auto") return selected;

  const fallback = getSpeechProviderPreset(provider)?.defaultModel;
  return fallback && fallback.toLowerCase() !== "auto" ? fallback : undefined;
}

export function isRemoteSpeechConfigured(args: {
  enabled: boolean;
  provider: RemoteSpeechProvider;
  endpoint: string;
  model: string;
}) {
  return Boolean(
    args.enabled &&
    resolvedSpeechEndpoint(args.provider, args.endpoint) &&
    resolvedSpeechModel(args.provider, args.model),
  );
}

export const REMOTE_SPEECH_MODEL_PREFIX = "remote:";

function providerModelLabel(providerId: string, model: string) {
  const label = getSpeechProviderPreset(providerId)?.label ?? providerId;
  const selectedModel = model.trim();
  return selectedModel ? `${label} · ${selectedModel}` : label;
}

function providerForDefaultModel(model: string) {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return undefined;
  return SPEECH_PROVIDER_PRESETS.find(
    (preset) => preset.defaultModel.trim().toLowerCase() === normalized,
  );
}

export function formatTranscriptionSpeechModel(stored: string): string | null {
  const value = stored.trim();
  if (!value) return null;

  if (value.startsWith(REMOTE_SPEECH_MODEL_PREFIX)) {
    const payload = value.slice(REMOTE_SPEECH_MODEL_PREFIX.length);
    const separator = payload.indexOf(":");
    if (separator > 0) {
      return providerModelLabel(
        payload.slice(0, separator),
        payload.slice(separator + 1),
      );
    }
    const fallback = getSpeechProviderPreset(payload)?.defaultModel;
    return providerModelLabel(
      payload,
      fallback && fallback !== "auto" ? fallback : "",
    );
  }

  const legacy = /^remote\s*\((.+)\)\s*$/i.exec(value);
  if (!legacy) return value;
  const model = legacy[1]?.trim() ?? "";
  const preset = providerForDefaultModel(model);
  return preset ? providerModelLabel(preset.id, model) : model;
}

export function isRemoteTranscriptionSpeechModel(stored: string) {
  const value = stored.trim();
  return (
    value.startsWith(REMOTE_SPEECH_MODEL_PREFIX) || /^remote\s*\(/i.test(value)
  );
}
