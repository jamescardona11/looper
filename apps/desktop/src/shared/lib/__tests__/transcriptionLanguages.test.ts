import { describe, expect, test } from "vitest";
import type { ModelInfo } from "../../../types";
import {
  buildActiveTranscriptionLanguageOptions,
  collectAllTranscriptionLanguages,
  resolveTranscriptionLanguage,
} from "../transcriptionLanguages";

const model: ModelInfo = {
  key: "model",
  label: "Model",
  description: "",
  size_mb: 0,
  engine_id: "test",
  family: "test",
  variant: "test",
  category: "standard",
  downloadable: true,
  tags: [],
  capabilities: [],
  supported_languages: [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "pt", name: "Portuguese" },
    { code: "fr", name: "French" },
  ],
  language_selection_mode: "user_select",
  ane_size_mb: null,
};

const allLanguages = collectAllTranscriptionLanguages([model]);

describe("buildActiveTranscriptionLanguageOptions", () => {
  test("exposes only the three current Dictation languages", () => {
    expect(allLanguages).toEqual([
      { code: "es", name: "Español" },
      { code: "en", name: "English" },
      { code: "pt", name: "Português" },
    ]);
  });

  test("keeps language selection explicit for user-select models", () => {
    const options = buildActiveTranscriptionLanguageOptions(
      model,
      allLanguages,
      false,
      "Unsupported",
      "Choose a compatible model.",
    );

    expect(options.map((option) => option.code)).toEqual(["es", "en", "pt"]);
  });

  test("does not expose Auto even when the model can detect the language", () => {
    const options = buildActiveTranscriptionLanguageOptions(
      { ...model, language_selection_mode: "auto_detect" },
      allLanguages,
      false,
      "Unsupported",
      "Choose a compatible model.",
    );

    expect(options.map((option) => option.code)).toEqual(["es", "en", "pt"]);
  });

  test("groups unsupported languages as locked options", () => {
    const options = buildActiveTranscriptionLanguageOptions(
      {
        ...model,
        supported_languages: [{ code: "en", name: "English" }],
      },
      allLanguages,
      false,
      "Unsupported",
      "Choose a compatible model.",
    );

    expect(
      options.map(({ code, locked, isHeader }) => ({
        code,
        locked,
        isHeader,
      })),
    ).toEqual([
      { code: "en", locked: false, isHeader: undefined },
      { code: "__unsupported__", locked: undefined, isHeader: true },
      { code: "es", locked: true, isHeader: undefined },
      { code: "pt", locked: true, isHeader: undefined },
    ]);
  });

  test("migrates legacy Auto and locale variants to an available language", () => {
    expect(resolveTranscriptionLanguage("", allLanguages, "pt-BR")).toBe("pt");
    expect(resolveTranscriptionLanguage("es-CO", allLanguages)).toBe("es");
    expect(resolveTranscriptionLanguage("fr", allLanguages, "fr-FR")).toBe(
      "en",
    );
  });
});
