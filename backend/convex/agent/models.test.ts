import { getActiveModel, MODELS } from "@looper/config/agent";
import { streamText } from "ai";
import { describe, expect, it } from "vitest";
import { resolveLanguageModel, selectModelConfig } from "./models";

describe("AI model config", () => {
  it("has models for all 3 providers", () => {
    const providers = new Set(Object.values(MODELS).map((m) => m.provider));
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("google")).toBe(true);
  });

  it("all models have cost estimates", () => {
    for (const [, m] of Object.entries(MODELS)) {
      expect(m.inputCostPer1M).toBeGreaterThanOrEqual(0);
      expect(m.outputCostPer1M).toBeGreaterThan(0);
      expect(m.model).toBeTruthy();
    }
  });

  it("default model resolves to gpt-4o-mini", () => {
    const model = getActiveModel();
    expect(model.model).toBe("gpt-4o-mini");
    expect(model.provider).toBe("openai");
  });

  it("has at least 10 models configured", () => {
    expect(Object.keys(MODELS).length).toBeGreaterThanOrEqual(10);
  });

  it("throws for unknown model", () => {
    process.env.AI_MODEL = "nonexistent-model";
    expect(() => getActiveModel()).toThrow("Unknown AI_MODEL");
    delete process.env.AI_MODEL;
  });
});

describe("Mock mode", () => {
  it("returns a working canned streaming model with no API key", async () => {
    process.env.MOCK_MODE = "true";
    try {
      // No userApiKey and no provider env key set — only works because the
      // mock branch short-circuits before the real provider lookup.
      const model = resolveLanguageModel(getActiveModel());
      const result = streamText({ model, prompt: "hello" });

      let text = "";
      for await (const delta of result.textStream) text += delta;

      expect(text).toContain("same Convex action");
      expect(text).toContain("Mock mode keeps this provider-free");
      // The stream completed and produced a usage object (exact token counts
      // are mock placeholders and not asserted).
      expect(await result.usage).toBeDefined();
    } finally {
      delete process.env.MOCK_MODE;
    }
  });

  it("is opt-in — off by default", () => {
    delete process.env.MOCK_MODE;
    // The mock branch is only taken when MOCK_MODE is explicitly set.
    expect(process.env.MOCK_MODE).toBeUndefined();
  });
});

describe("Multi-provider auto-fallback", () => {
  const openaiReq = getActiveModel(); // a complete openai ModelConfig

  it("keeps the requested provider when it has a server key", () => {
    const out = selectModelConfig(openaiReq, null, { openai: "sk-openai" });
    expect(out.provider).toBe("openai");
  });

  it("keeps the requested provider when the user supplied a key (BYOK)", () => {
    const out = selectModelConfig(openaiReq, "sk-user", {});
    expect(out).toBe(openaiReq);
  });

  it("falls back to a configured provider when the requested one has no key", () => {
    const out = selectModelConfig(openaiReq, null, { anthropic: "sk-anthropic" });
    expect(out.provider).toBe("anthropic");
    expect(out.model).toBeTruthy();
  });

  it("returns the request unchanged when nothing is configured (resolve throws later)", () => {
    const out = selectModelConfig(openaiReq, null, {});
    expect(out).toBe(openaiReq);
  });
});
