import { describe, expect, it } from "vitest";

describe("STT config", () => {
  it("default model is nova-3", async () => {
    const { DEFAULT_STT_MODEL } = await import("@looper/config/stt");
    expect(DEFAULT_STT_MODEL).toBe("nova-3");
  });

  it("defines one catalog-backed batch default per provider", async () => {
    const { BATCH_STT_DEFAULT_MODELS, getSTTModel } = await import("@looper/config/stt");

    expect(BATCH_STT_DEFAULT_MODELS).toEqual({
      deepgram: "nova-3",
      assemblyai: "universal-3-pro",
      elevenlabs: "scribe_v2",
      openai: "gpt-4o-transcribe",
    });
    for (const [provider, model] of Object.entries(BATCH_STT_DEFAULT_MODELS)) {
      expect(getSTTModel(model)?.provider).toBe(provider);
    }
  });

  it("all models have required fields", async () => {
    const { STT_MODELS } = await import("@looper/config/stt");
    for (const m of STT_MODELS) {
      expect(["deepgram", "assemblyai", "elevenlabs", "openai"]).toContain(m.provider);
      expect(m.model).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.languages).toBeGreaterThan(0);
      expect(typeof m.realtime).toBe("boolean");
    }
  });

  it("has models for all 4 providers", async () => {
    const { STT_MODELS } = await import("@looper/config/stt");
    const providers = new Set(STT_MODELS.map((m) => m.provider));
    expect(providers.has("deepgram")).toBe(true);
    expect(providers.has("assemblyai")).toBe(true);
    expect(providers.has("elevenlabs")).toBe(true);
    expect(providers.has("openai")).toBe(true);
  });

  it("has at least one realtime model", async () => {
    const { STT_MODELS } = await import("@looper/config/stt");
    expect(STT_MODELS.some((m) => m.realtime)).toBe(true);
  });

  it("getSTTModel returns correct model", async () => {
    const { getSTTModel } = await import("@looper/config/stt");
    const nova = getSTTModel("nova-3");
    expect(nova?.provider).toBe("deepgram");
    expect(nova?.realtime).toBe(true);
  });

  it("getSTTModel returns undefined for unknown", async () => {
    const { getSTTModel } = await import("@looper/config/stt");
    expect(getSTTModel("nonexistent")).toBeUndefined();
  });
});
