import { describe, expect, test } from "vitest";
import {
  aiFeatureAccess,
  isGeneralSectionVisible,
  shouldWarnMissingLocalModel,
} from "../general-settings-model";
import type { ModelStatus } from "../../../../../types";

const missingModel: ModelStatus = {
  key: "parakeet",
  installed: false,
  ane_installed: false,
  bytes_on_disk: 0,
  missing_files: ["model.bin"],
  directory: "/models/parakeet",
};

describe("general settings model", () => {
  test("filters focused sections without hiding the full view", () => {
    expect(isGeneralSectionVisible(undefined, "processing")).toBe(true);
    expect(isGeneralSectionVisible("processing", "processing")).toBe(true);
    expect(isGeneralSectionVisible("microphone", "processing")).toBe(false);
  });

  test("warns only when local processing lacks both a model and remote fallback", () => {
    const base = {
      transcriptionMode: "local" as const,
      localModel: "parakeet",
      localModelStatus: missingModel,
      remoteSpeechEnabled: false,
      remoteSpeechProvider: "openai" as const,
      remoteSpeechEndpoint: "https://api.openai.com/v1",
      remoteSpeechModel: "gpt-4o-transcribe",
    };
    expect(shouldWarnMissingLocalModel(base)).toBe(true);
    expect(
      shouldWarnMissingLocalModel({ ...base, transcriptionMode: "cloud" }),
    ).toBe(false);
    expect(
      shouldWarnMissingLocalModel({ ...base, remoteSpeechEnabled: true }),
    ).toBe(false);
    expect(
      shouldWarnMissingLocalModel({
        ...base,
        localModelStatus: { ...missingModel, installed: true },
      }),
    ).toBe(false);
  });

  test("routes unavailable AI features to the missing prerequisite", () => {
    expect(aiFeatureAccess(true, false)).toEqual({
      disabled: false,
      settingsTarget: null,
    });
    expect(aiFeatureAccess(false, false).settingsTarget).toBe("account");
    expect(aiFeatureAccess(false, true).settingsTarget).toBe("providers");
  });
});
