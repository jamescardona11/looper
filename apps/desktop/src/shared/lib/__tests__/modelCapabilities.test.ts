import { describe, expect, test } from "vitest";
import {
  hasModelCapability,
  MODEL_CAPABILITY_DIARIZATION,
  MODEL_CAPABILITY_DICTIONARY,
  MODEL_CAPABILITY_STREAMING,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../modelCapabilities";

describe("model capabilities", () => {
  test("keeps the capability identifiers used by the native catalog", () => {
    expect([
      MODEL_CAPABILITY_DICTIONARY,
      MODEL_CAPABILITY_TIMESTAMPS,
      MODEL_CAPABILITY_STREAMING,
      MODEL_CAPABILITY_DIARIZATION,
    ]).toEqual(["dictionary", "timestamps", "streaming", "diarization"]);
  });

  test("matches capability names without case sensitivity", () => {
    const model = { capabilities: ["Streaming", "TIMESTAMPS"] };

    expect(hasModelCapability(model, "streaming")).toBe(true);
    expect(hasModelCapability(model, "timestamps")).toBe(true);
    expect(hasModelCapability(model, "dictionary")).toBe(false);
  });

  test("handles unavailable model metadata", () => {
    expect(hasModelCapability(null, "streaming")).toBe(false);
    expect(hasModelCapability({}, "streaming")).toBe(false);
  });
});
