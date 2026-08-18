import { describe, expect, test } from "vitest";
import type { DownloadEvent, ModelInfo, ModelStatus } from "../../../types";
import {
  modelContinueIntent,
  modelGridClassName,
  projectOnboardingModel,
} from "./model-step-policy";

const model: ModelInfo = {
  key: "parakeet",
  label: "Parakeet",
  description: "Local model",
  size_mb: 600,
  engine_id: "nvidia",
  variant: "int8",
  tags: [],
  capabilities: [],
  supported_languages: [],
  family: "parakeet",
  category: "standard",
  downloadable: true,
  language_selection_mode: "auto_detect",
  ane_size_mb: 120,
};

const status: ModelStatus = {
  key: model.key,
  installed: false,
  ane_installed: true,
  bytes_on_disk: 42,
  missing_files: ["model.bin"],
  directory: "/models/parakeet",
};

describe("model step policy", () => {
  test("projects ANE size, persisted status, and active download progress", () => {
    const activity: DownloadEvent = {
      status: "downloading",
      percent: 40,
      file: "model.bin",
    };
    const projected = projectOnboardingModel(model, status, activity);

    expect(projected.model.size_mb).toBe(720);
    expect(projected.status).toEqual(status);
    expect(projected.progress).toBe(activity);
  });

  test("treats completed activity as installed without exposing progress", () => {
    const projected = projectOnboardingModel(model, undefined, {
      status: "complete",
      percent: 100,
    });
    expect(projected.status.installed).toBe(true);
    expect(projected.progress).toBeUndefined();
  });

  test("preserves a model without an ANE artifact and fills absent status", () => {
    const projected = projectOnboardingModel(
      { ...model, ane_size_mb: null },
      undefined,
      undefined,
    );
    expect(projected.model.size_mb).toBe(600);
    expect(projected.status).toMatchObject({
      installed: false,
      ane_installed: false,
      bytes_on_disk: 0,
      missing_files: [],
      directory: "",
    });
    expect(projected.progress).toBeUndefined();
  });

  test("resolves Continue intent and grid layout deterministically", () => {
    expect(modelContinueIntent(true, false)).toBe("ignore");
    expect(modelContinueIntent(false, false)).toBe("confirm");
    expect(modelContinueIntent(false, true)).toBe("advance");
    expect(modelGridClassName(1)).toContain("grid-cols-1");
    expect(modelGridClassName(2)).toContain("grid-cols-2");
  });
});
