import { describe, expect, test } from "vitest";
import type { ModelInfo } from "../../types/models";
import {
  filterModelGroups,
  groupModelCatalog,
  preferredVariantKey,
  sectionModelGroups,
} from "./modelPickerLogic";

function model(overrides: Partial<ModelInfo>): ModelInfo {
  return {
    key: "family-q5",
    label: "Parakeet (Q5)",
    description: "Local model",
    size_mb: 600,
    engine_id: "parakeet",
    family: "parakeet",
    variant: "Q5_0",
    category: "standard",
    downloadable: true,
    tags: ["fast"],
    capabilities: [],
    supported_languages: [{ code: "en", name: "English" }],
    language_selection_mode: "user_select",
    ane_size_mb: null,
    ...overrides,
  };
}

describe("model picker logic", () => {
  test("groups families and applies the variant priority", () => {
    const groups = groupModelCatalog([
      model({ key: "q8", variant: "Q8_0", size_mb: 800 }),
      model({ key: "q5", variant: "Q5_0", size_mb: 600 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Parakeet");
    expect(groups[0]?.variants.map((variant) => variant.key)).toEqual([
      "q5",
      "q8",
    ]);
    expect(preferredVariantKey(groups[0]!, "missing")).toBe("q8");
    expect(preferredVariantKey(groups[0]!, "q5")).toBe("q5");
  });

  test("filters search/category and creates ordered non-empty sections", () => {
    const groups = groupModelCatalog([
      model({ key: "standard", family: "standard" }),
      model({
        key: "legacy",
        family: "legacy",
        label: "Whisper Legacy",
        category: "legacy",
        tags: ["archive"],
      }),
    ]);

    expect(filterModelGroups(groups, "archive", null)[0]?.id).toBe("legacy");
    expect(filterModelGroups(groups, "", "standard")[0]?.id).toBe("standard");
    expect(
      sectionModelGroups(groups).map((section) => section.category),
    ).toEqual(["standard", "legacy"]);
  });
});
