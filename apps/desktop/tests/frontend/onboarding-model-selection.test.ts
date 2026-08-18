import { describe, expect, test } from "vitest";
import type { ModelInfo } from "../../src/types";
import {
  pickOnboardingModels,
  resolveOnboardingLanguage,
} from "../../src/features/onboarding/modelSelection";

const model = (
  key: string,
  engineId: string,
  downloadable = true,
): ModelInfo => ({
  key,
  label: key,
  description: key,
  size_mb: 1,
  engine_id: engineId,
  family: engineId,
  variant: "Int8",
  category: "standard",
  downloadable,
  tags: key === "parakeet_tdt_int8" ? ["Recommended"] : [],
  capabilities: [],
  supported_languages: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "pt", name: "Portuguese" },
  ],
  ane_size_mb: null,
});

describe("onboarding model selection", () => {
  test("offers Parakeet and Cohere in product order", () => {
    const picked = pickOnboardingModels([
      model("cohere_transcribe_int4", "cohere"),
      model("some_future_model", "future"),
      model("parakeet_tdt_int8", "nvidia"),
    ]);

    expect(picked.map(({ key }) => key)).toEqual([
      "parakeet_tdt_int8",
      "cohere_transcribe_int4",
    ]);
  });

  test("keeps a single supported option functional", () => {
    expect(
      pickOnboardingModels([model("cohere_transcribe_int4", "cohere")]).map(
        ({ key }) => key,
      ),
    ).toEqual(["cohere_transcribe_int4"]);
  });

  test("gives Cohere an explicit supported language", () => {
    const cohere = model("cohere_transcribe_int4", "cohere");

    expect(resolveOnboardingLanguage(cohere, "auto", "es-CO")).toBe("es");
    expect(resolveOnboardingLanguage(cohere, "fr", "pt-BR")).toBe("pt");
    expect(resolveOnboardingLanguage(cohere, "", "fr-FR")).toBe("en");
    expect(
      resolveOnboardingLanguage(
        model("parakeet_tdt_int8", "nvidia"),
        "auto",
        "es-CO",
      ),
    ).toBe("auto");
  });
});
