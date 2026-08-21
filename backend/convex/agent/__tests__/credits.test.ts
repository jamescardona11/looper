import { FEATURE_CREDIT_COST, RATE_LIMITS } from "@looper/config/agent";
import { describe, expect, it } from "vitest";

describe("RATE_LIMITS config", () => {
  it("free tier has a positive daily limit", () => {
    expect(RATE_LIMITS.free.messagesPerDay).toBeGreaterThan(0);
  });

  it("pro tier has higher limit than free", () => {
    expect(RATE_LIMITS.pro.messagesPerDay).toBeGreaterThan(RATE_LIMITS.free.messagesPerDay);
  });

  it("ultra tier is unlimited (-1)", () => {
    expect(RATE_LIMITS.ultra.messagesPerDay).toBe(-1);
  });
});

describe("FEATURE_CREDIT_COST config", () => {
  it("every feature costs at least 1 credit (no accidentally-free feature)", () => {
    for (const cost of Object.values(FEATURE_CREDIT_COST)) {
      expect(cost).toBeGreaterThanOrEqual(1);
    }
  });

  it("only charges active audio-first product actions", () => {
    expect(Object.keys(FEATURE_CREDIT_COST).sort()).toEqual(["agentMessage", "transcription"]);
  });
});
