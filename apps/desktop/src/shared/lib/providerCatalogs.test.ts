import { describe, expect, test } from "vitest";
import {
  CLOUD_PROVIDERS,
  formatTranscriptionLlmModel,
  getProviderPreset,
  LOCAL_PROVIDERS,
  resolvedLlmEndpoint,
} from "./llmProviders";
import {
  CLOUD_SPEECH_PROVIDERS,
  formatTranscriptionSpeechModel,
  getSpeechProviderPreset,
  isRemoteSpeechConfigured,
  isRemoteTranscriptionSpeechModel,
  LOCAL_SPEECH_PROVIDERS,
  resolvedSpeechModel,
  SPEECH_PROVIDERS,
} from "./speechProviders";

describe("provider catalogs", () => {
  test("separates local and credential-backed language model providers", () => {
    expect(LOCAL_PROVIDERS.map((provider) => provider.id)).toEqual([
      "local",
      "custom",
    ]);
    expect(CLOUD_PROVIDERS.some((provider) => provider.id === "openai")).toBe(
      true,
    );
    expect(getProviderPreset("anthropic")?.defaultModel).toBe(
      "claude-haiku-4-5",
    );
    expect(resolvedLlmEndpoint("openai", " https://gateway.test/v1 ")).toBe(
      "https://gateway.test/v1",
    );
  });

  test("formats stored language model selections", () => {
    expect(formatTranscriptionLlmModel("openai:gpt-5.4-mini")).toBe(
      "OpenAI · gpt-5.4-mini",
    );
    expect(formatTranscriptionLlmModel("local")).toBe("Qwen (on this Mac)");
    expect(formatTranscriptionLlmModel("  ")).toBeNull();
  });

  test("resolves speech defaults and configuration requirements", () => {
    expect(getSpeechProviderPreset("deepgram")?.compatibility).toBe(
      "openai-compatible-proxy",
    );
    expect(resolvedSpeechModel("openai", "auto")).toBe(
      "gpt-4o-mini-transcribe",
    );
    expect(
      isRemoteSpeechConfigured({
        enabled: true,
        provider: "openai",
        endpoint: "",
        model: "auto",
      }),
    ).toBe(true);
    expect(
      isRemoteSpeechConfigured({
        enabled: false,
        provider: "openai",
        endpoint: "",
        model: "auto",
      }),
    ).toBe(false);
  });

  test("keeps the ordered speech provider catalog and proxy boundaries", () => {
    expect(SPEECH_PROVIDERS.map(({ id }) => id)).toEqual([
      "openai",
      "groq",
      "mistral",
      "fireworks",
      "openrouter",
      "deepgram",
      "elevenlabs",
    ]);
    expect(LOCAL_SPEECH_PROVIDERS).toEqual([]);
    expect(CLOUD_SPEECH_PROVIDERS).toEqual(SPEECH_PROVIDERS);
    expect(getSpeechProviderPreset("custom")).toMatchObject({
      endpoint: "",
      defaultModel: "auto",
      apiKeyRequired: false,
    });
    expect(getSpeechProviderPreset("fireworks")).toMatchObject({
      endpoint: "https://audio-prod.api.fireworks.ai/v1",
      compatibility: "direct-openai-compatible",
    });
  });

  test("formats current and legacy remote speech selections", () => {
    expect(formatTranscriptionSpeechModel("remote:groq:custom-whisper")).toBe(
      "Groq · custom-whisper",
    );
    expect(
      formatTranscriptionSpeechModel("remote (gpt-4o-mini-transcribe)"),
    ).toBe("OpenAI · gpt-4o-mini-transcribe");
    expect(isRemoteTranscriptionSpeechModel("remote:openai")).toBe(true);
    expect(isRemoteTranscriptionSpeechModel("parakeet_tdt")).toBe(false);
  });
});
