export type LlmProvider = string;

export type LlmProviderPreset = {
  id: LlmProvider;
  label: string;
  endpoint: string;
  defaultModel: string;
  apiKeyRequired: boolean;
};

export const LOCAL_LLM_PROVIDER = "local";

type ProviderSeed = readonly [
  label: string,
  endpoint: string,
  defaultModel: string,
  apiKeyRequired: boolean,
];

const PROVIDER_SEEDS: Record<string, ProviderSeed> = {
  local: ["Qwen (on this Mac)", "", "", false],
  custom: ["Custom", "", "", false],
  openai: ["OpenAI", "https://api.openai.com/v1", "gpt-5.4-mini", true],
  anthropic: [
    "Anthropic",
    "https://api.anthropic.com",
    "claude-haiku-4-5",
    true,
  ],
  google: [
    "Google Gemini",
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "gemini-3.1-flash-lite-preview",
    true,
  ],
  xai: ["xAI (Grok)", "https://api.x.ai/v1", "grok-4-1-fast-reasoning", true],
  groq: ["Groq", "https://api.groq.com/openai/v1", "openai/gpt-oss-20b", true],
  cerebras: ["Cerebras", "https://api.cerebras.ai/v1", "gpt-oss-120b", true],
  sambanova: ["SambaNova", "https://api.sambanova.ai/v1", "MiniMax-M2.5", true],
  together: [
    "Together AI",
    "https://api.together.xyz/v1",
    "openai/gpt-oss-20b",
    true,
  ],
  openrouter: [
    "OpenRouter",
    "https://openrouter.ai/api/v1",
    "openai/gpt-5.4-mini",
    true,
  ],
  perplexity: [
    "Perplexity",
    "https://api.perplexity.ai",
    "sonar-reasoning-pro",
    true,
  ],
  deepseek: [
    "DeepSeek",
    "https://api.deepseek.com/v1",
    "deepseek-reasoner",
    true,
  ],
  fireworks: [
    "Fireworks",
    "https://api.fireworks.ai/inference/v1",
    "accounts/fireworks/models/gpt-oss-20b",
    true,
  ],
  mistral: [
    "Mistral",
    "https://api.mistral.ai/v1",
    "magistral-small-latest",
    true,
  ],
};

const LLM_PROVIDER_PRESETS = Object.entries(PROVIDER_SEEDS).map(
  ([id, [label, endpoint, defaultModel, apiKeyRequired]]) => ({
    id,
    label,
    endpoint,
    defaultModel,
    apiKeyRequired,
  }),
);
const PRESET_BY_ID = new Map(
  LLM_PROVIDER_PRESETS.map((preset) => [preset.id, preset]),
);

export const LOCAL_PROVIDERS = LLM_PROVIDER_PRESETS.filter(
  (preset) => !preset.apiKeyRequired,
);
export const CLOUD_PROVIDERS = LLM_PROVIDER_PRESETS.filter(
  (preset) => preset.apiKeyRequired,
);

export function getProviderPreset(id: LlmProvider) {
  return PRESET_BY_ID.get(id);
}

export function resolvedLlmEndpoint(
  provider: LlmProvider,
  endpoint: string,
): string {
  return endpoint.trim() || getProviderPreset(provider)?.endpoint || "";
}

export function formatTranscriptionLlmModel(stored: string): string | null {
  const value = stored.trim();
  if (!value) return null;

  const separator = value.indexOf(":");
  if (separator > 0) {
    const providerId = value.slice(0, separator);
    const model = value.slice(separator + 1).trim();
    const providerLabel = getProviderPreset(providerId)?.label ?? providerId;
    return model ? `${providerLabel} · ${model}` : providerLabel;
  }
  return getProviderPreset(value)?.label ?? value;
}
