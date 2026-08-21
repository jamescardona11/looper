import { describe, expect, test } from "vitest";
import type { ModelInfo } from "../../../contracts";
import {
  pickDefaultOnboardingModel,
  pickOnboardingModels,
  pickRecommendedOnboardingModel,
  resolveOnboardingLanguage,
} from "../modelSelection";

const model = (key: string, overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  key,
  label: key,
  description: `${key} description`,
  size_mb: 100,
  engine_id: "nvidia",
  variant: "int8",
  tags: [],
  capabilities: [],
  supported_languages: [],
  family: "parakeet",
  category: "standard",
  downloadable: true,
  language_selection_mode: "auto_detect",
  ane_size_mb: null,
  ...overrides,
});

describe("onboarding model selection", () => {
  test("returns only downloadable preferred models in product order", () => {
    const result = pickOnboardingModels([
      model("cohere_transcribe_int4"),
      model("other"),
      model("parakeet_tdt_int8"),
      model("parakeet_tdt_int8", { downloadable: false }),
    ]);

    expect(result.map(({ key }) => key)).toEqual([
      "parakeet_tdt_int8",
      "cohere_transcribe_int4",
    ]);
  });

  test("keeps an available persisted model and otherwise uses the first candidate", () => {
    const models = [model("first"), model("persisted")];

    expect(pickDefaultOnboardingModel(models, "persisted")).toBe("persisted");
    expect(pickDefaultOnboardingModel(models, "missing")).toBe("first");
    expect(pickDefaultOnboardingModel([], "missing")).toBe("missing");
  });

  test("prefers a recommended downloadable model case-insensitively", () => {
    const recommended = model("recommended", { tags: ["Recommended"] });
    expect(
      pickRecommendedOnboardingModel([
        model("ignored", { downloadable: false, tags: ["recommended"] }),
        model("fallback"),
        recommended,
      ]),
    ).toBe(recommended);
    expect(pickRecommendedOnboardingModel([model("fallback")])?.key).toBe(
      "fallback",
    );
    expect(pickRecommendedOnboardingModel([])).toBeNull();
  });
});

describe("onboarding language selection", () => {
  const cohere = model("cohere", {
    engine_id: "cohere",
    supported_languages: [
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
    ],
  });

  test("preserves the current language for non-Cohere models", () => {
    expect(resolveOnboardingLanguage(model("local"), "pt-BR", "es")).toBe(
      "pt-BR",
    );
  });

  test("resolves exact and regional language candidates", () => {
    expect(resolveOnboardingLanguage(cohere, "ES", "en")).toBe("es");
    expect(resolveOnboardingLanguage(cohere, "es-CO", "en")).toBe("es");
    expect(resolveOnboardingLanguage(cohere, "auto", "es-CO")).toBe("es");
  });

  test("falls back through English, first supported language, and en", () => {
    expect(resolveOnboardingLanguage(cohere, "fr", "pt")).toBe("en");
    expect(
      resolveOnboardingLanguage(
        { ...cohere, supported_languages: [{ code: "es", name: "Spanish" }] },
        "fr",
        "pt",
      ),
    ).toBe("es");
    expect(
      resolveOnboardingLanguage(
        { ...cohere, supported_languages: [] },
        "fr",
        "pt",
      ),
    ).toBe("en");
  });
});
