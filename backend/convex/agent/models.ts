// Resolve an AI SDK LanguageModel from Looper's ModelConfig.
// Supports OpenAI, Anthropic, and Google AI providers.
// BYOK: when a user-supplied key is available for the active provider, it
// overrides the server key (works for OpenAI, Anthropic, and Google).

import { MODELS, type ModelConfig } from "@looper/config/agent";
import type { LanguageModel } from "ai";
import { env, isMockMode } from "../env";

type Provider = ModelConfig["provider"];

// A canned streaming model used when MOCK_MODE is on — lets the chat work
// end-to-end with zero provider keys. Built with the AI SDK's test utilities
// (loaded lazily, same require() style as the providers below).
function mockLanguageModel(config: ModelConfig): LanguageModel {
  const { MockLanguageModelV3, simulateReadableStream } =
    require("ai/test") as typeof import("ai/test");
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: 15,
        chunks: [
          { type: "text-start", id: "0" },
          {
            type: "text-delta",
            id: "0",
            delta:
              "Looper is streaming this simulated Recording Assistant response through the same Convex action and private thread used by a live provider.\n\n",
          },
          {
            type: "text-delta",
            id: "0",
            delta: `- Active model contract: **${config.provider}/${config.model}**\n- Answers stay scoped to the user's recordings and transcript history\n- Threads remain private and text-only\n\nMock mode keeps this provider-free; connect a supported API key to replace only the model output.`,
          },
          { type: "text-end", id: "0" },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 8, outputTokens: 24, totalTokens: 32 },
          },
          // The exact LanguageModelV3StreamPart usage shape is version-specific
          // (nested token objects in this AI SDK build); the runtime is verified
          // by models.test.ts, so the literal is kept simple and cast here.
        ] as unknown as never[],
      }),
    }),
  }) as unknown as LanguageModel;
}

// Pure provider-fallback selection: if the requested provider has no usable key
// (user-supplied or server), fall back to the first model in MODELS whose
// provider DOES have a server key. Returns the requested config unchanged when
// it's usable, or when nothing is configured (createModel then throws the clear
// per-provider error). Kept pure (keys passed in) so it's unit-testable.
export function selectModelConfig(
  requested: ModelConfig,
  userApiKey: string | null | undefined,
  serverKeys: Partial<Record<Provider, string | undefined>>,
): ModelConfig {
  if (userApiKey || serverKeys[requested.provider]) return requested;
  for (const candidate of Object.values(MODELS)) {
    if (serverKeys[candidate.provider]) return candidate;
  }
  return requested;
}

function createModel(config: ModelConfig, userApiKey?: string | null): LanguageModel {
  switch (config.provider) {
    case "openai": {
      const apiKey = userApiKey ?? env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("No OpenAI API key configured");
      const { createOpenAI } = require("@ai-sdk/openai") as typeof import("@ai-sdk/openai");
      return createOpenAI({ apiKey }).chat(config.model);
    }
    case "anthropic": {
      const apiKey = userApiKey ?? env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("No Anthropic API key configured");
      const { createAnthropic } =
        require("@ai-sdk/anthropic") as typeof import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey }).chat(config.model);
    }
    case "google": {
      const apiKey = userApiKey ?? env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error("No Google AI API key configured");
      const { createGoogleGenerativeAI } =
        require("@ai-sdk/google") as typeof import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey })(config.model);
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

export function resolveLanguageModel(
  config: ModelConfig,
  userApiKey?: string | null,
  // Per-request override; defaults to the global env so callers that don't pass
  // a per-user flag (e.g. the shared completion cache) keep working unchanged.
  mock: boolean = isMockMode(),
): LanguageModel {
  if (mock) return mockLanguageModel(config);

  const selected = selectModelConfig(config, userApiKey, {
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_API_KEY,
  });
  // A user-supplied key only applies to the originally-requested provider.
  const key = selected.provider === config.provider ? userApiKey : null;
  return createModel(selected, key);
}
