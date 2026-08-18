import { describe, expect, test } from "vitest";
import type { ModelInfo } from "../../types";
import {
  deriveModelStats,
  formatModelSize,
  formatQuantLabel,
  sortInstalledModels,
} from "./modelStats";

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    key: "model",
    label: "Model",
    description: "",
    size_mb: 0,
    engine_id: "engine",
    family: "family",
    variant: "",
    category: "speech",
    downloadable: true,
    tags: [],
    capabilities: [],
    supported_languages: [],
    language_selection_mode: "auto_detect",
    ane_size_mb: null,
    ...overrides,
  };
}

describe("model statistics", () => {
  test("formats megabytes and gigabytes at the display threshold", () => {
    expect(formatModelSize(999.6)).toBe("1000 MB");
    expect(formatModelSize(1_000)).toBe("1.0 GB");
  });

  test("keeps installed models first and does not mutate the input", () => {
    const models = [
      model({ key: "b", label: "Beta", downloadable: true }),
      model({ key: "a", label: "Alpha", downloadable: false }),
      model({ key: "c", label: "Charlie", downloadable: false }),
    ];

    expect(sortInstalledModels(models).map(({ key }) => key)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(models.map(({ key }) => key)).toEqual(["b", "a", "c"]);
  });

  test("derives language availability from explicit tags before locale codes", () => {
    expect(
      deriveModelStats(
        model({
          tags: ["MULTILINGUAL"],
          supported_languages: [{ code: "en", name: "English" }],
        }),
      ),
    ).toEqual({ englishOnly: false, languagesLabel: "1 languages" });
    expect(
      deriveModelStats(
        model({
          supported_languages: [{ code: "en-US", name: "English" }],
        }),
      ),
    ).toEqual({ englishOnly: true, languagesLabel: "English only" });
  });

  test("omits an empty quantization label", () => {
    expect(formatQuantLabel("")).toBeNull();
    expect(formatQuantLabel("Q5_K_M")).toBe("Q5_K_M");
  });
});
