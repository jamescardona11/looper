import { describe, expect, it } from "vitest";
import { buildKeyboardSyncPayload } from "../keyboard-config";

describe("keyboard sync payload", () => {
  it("preserves the legacy keyboard dictionary contract", () => {
    const payload = buildKeyboardSyncPayload({
      convexUrl: "https://looper.convex.cloud",
      refreshToken: "not-a-real-token",
      localSttModelPath: "/data/user/0/com.j11.looper.mobile/files/sherpa-onnx/models/stt/parakeet",
      entries: [{ id: "term-1", term: "Telepatia", createdAt: 1 }],
      replacements: [{ id: "rule-1", source: "looper", destination: "Looper", createdAt: 2 }],
      snippets: [
        { id: "snippet-1", trigger: "mi correo", expansion: "hello@example.com", createdAt: 3 },
      ],
    });

    expect(payload).toEqual({
      convexUrl: "https://looper.convex.cloud",
      refreshToken: "not-a-real-token",
      localSttModelPath: "/data/user/0/com.j11.looper.mobile/files/sherpa-onnx/models/stt/parakeet",
      transcriptionMode: "local",
      termIds: ["term-1", "rule-1"],
      termById: {
        "term-1": { sourceValue: "Telepatia", destinationValue: "Telepatia", isReplacement: false },
        "rule-1": { sourceValue: "looper", destinationValue: "Looper", isReplacement: true },
      },
      snippets: [{ trigger: "mi correo", expansion: "hello@example.com" }],
      activeToneIds: [],
      toneById: {},
      selectedToneId: null,
      smartModeRules: [],
    });
  });

  it("uses cloud transcription if the local model is unavailable", () => {
    const payload = buildKeyboardSyncPayload({
      convexUrl: "https://looper.convex.cloud",
      refreshToken: "not-a-real-token",
      localSttModelPath: null,
      entries: [],
      replacements: [],
      snippets: [],
    });

    expect(payload).toMatchObject({
      localSttModelPath: null,
      transcriptionMode: "cloud",
    });
  });
});
