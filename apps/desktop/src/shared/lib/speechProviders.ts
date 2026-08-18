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

type ProviderKind = "direct" | "proxy";
type ProviderRow = readonly [
  id: string,
  label: string,
  endpoint: string,
  defaultModel: string,
  kind: ProviderKind,
  notes?: string,
];

const PROVIDER_ROWS: readonly ProviderRow[] = [
  ["custom", "Custom", "", "auto", "direct"],
  [
    "openai",
    "OpenAI",
    "https://api.openai.com/v1",
    remoteSpeechDefaults.openai,
    "direct",
  ],
  [
    "groq",
    "Groq",
    "https://api.groq.com/openai/v1",
    remoteSpeechDefaults.groq,
    "direct",
  ],
  [
    "mistral",
    "Mistral",
    "https://api.mistral.ai/v1",
    remoteSpeechDefaults.mistral,
    "direct",
  ],
  [
    "fireworks",
    "Fireworks AI",
    "https://audio-prod.api.fireworks.ai/v1",
    remoteSpeechDefaults.fireworks,
    "direct",
    "Uses the Fireworks audio API base, not the normal inference base.",
  ],
  [
    "openrouter",
    "OpenRouter",
    "https://openrouter.ai/api/v1",
    remoteSpeechDefaults.openrouter,
    "direct",
  ],
  [
    "deepgram",
    "Deepgram",
    "http://localhost:4000/v1",
    remoteSpeechDefaults.deepgram,
    "proxy",
    "Use through an OpenAI-compatible gateway or proxy.",
  ],
  [
    "elevenlabs",
    "ElevenLabs",
    "http://localhost:4000/v1",
    remoteSpeechDefaults.elevenlabs,
    "proxy",
    "Use through an OpenAI-compatible gateway or proxy.",
  ],
];

const presetFromRow = ([
  id,
  label,
  endpoint,
  defaultModel,
  kind,
  notes,
]: ProviderRow): SpeechProviderPreset => ({
  id,
  label,
  endpoint,
  defaultModel,
  apiKeyRequired: id !== "custom",
  compatibility:
    kind === "proxy" ? "openai-compatible-proxy" : "direct-openai-compatible",
  supportsModelDiscovery: true,
  ...(notes ? { notes } : {}),
});

const PRESETS = PROVIDER_ROWS.map(presetFromRow);
const PRESET_INDEX = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const SPEECH_PROVIDERS = PRESETS.filter(({ id }) => id !== "custom");
export const LOCAL_SPEECH_PROVIDERS = SPEECH_PROVIDERS.filter(
  ({ apiKeyRequired }) => !apiKeyRequired,
);
export const CLOUD_SPEECH_PROVIDERS = SPEECH_PROVIDERS.filter(
  ({ apiKeyRequired }) => apiKeyRequired,
);

export const getSpeechProviderPreset = (id: RemoteSpeechProvider) =>
  PRESET_INDEX.get(id);

export const supportsSpeechProviderModelDiscovery = (
  id: RemoteSpeechProvider,
) => getSpeechProviderPreset(id)?.supportsModelDiscovery ?? false;

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
  const requested = model.trim();
  if (requested && requested.toLowerCase() !== "auto") return requested;
  const configuredDefault = getSpeechProviderPreset(provider)?.defaultModel;
  return configuredDefault && configuredDefault.toLowerCase() !== "auto"
    ? configuredDefault
    : undefined;
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

const formatProviderModel = (providerId: string, model: string) => {
  const providerName = getSpeechProviderPreset(providerId)?.label ?? providerId;
  const selected = model.trim();
  return selected ? `${providerName} · ${selected}` : providerName;
};

const presetWithDefault = (model: string) => {
  const requested = model.trim().toLowerCase();
  if (!requested) return undefined;
  return PRESETS.find(
    ({ defaultModel }) => defaultModel.trim().toLowerCase() === requested,
  );
};

type StoredSpeechSelection =
  | { kind: "empty" }
  | { kind: "plain"; value: string }
  | { kind: "remote"; provider: string; model: string }
  | { kind: "legacy"; model: string };

const parseStoredSelection = (stored: string): StoredSpeechSelection => {
  const value = stored.trim();
  if (!value) return { kind: "empty" };
  if (value.startsWith(REMOTE_SPEECH_MODEL_PREFIX)) {
    const payload = value.slice(REMOTE_SPEECH_MODEL_PREFIX.length);
    const separator = payload.indexOf(":");
    const provider = separator > 0 ? payload.slice(0, separator) : payload;
    const explicitModel = separator > 0 ? payload.slice(separator + 1) : "";
    const fallback = getSpeechProviderPreset(provider)?.defaultModel;
    const model = explicitModel || (fallback === "auto" ? "" : fallback) || "";
    return { kind: "remote", provider, model };
  }
  const legacy = /^remote\s*\((.+)\)\s*$/i.exec(value);
  return legacy
    ? { kind: "legacy", model: legacy[1]?.trim() ?? "" }
    : { kind: "plain", value };
};

export function formatTranscriptionSpeechModel(stored: string): string | null {
  const selection = parseStoredSelection(stored);
  switch (selection.kind) {
    case "empty":
      return null;
    case "plain":
      return selection.value;
    case "remote":
      return formatProviderModel(selection.provider, selection.model);
    case "legacy": {
      const preset = presetWithDefault(selection.model);
      return preset
        ? formatProviderModel(preset.id, selection.model)
        : selection.model;
    }
  }
}

export function isRemoteTranscriptionSpeechModel(stored: string) {
  const kind = parseStoredSelection(stored).kind;
  return kind === "remote" || kind === "legacy";
}
