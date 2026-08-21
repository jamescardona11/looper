import { describe, expect, test } from "vitest";

import type { ModelInfo, ModelStatus } from "../../../../types/index";
import { resolveModelDeletionUpdate } from "../model-deletion-policy";

const model = (key: string, options: Partial<ModelInfo> = {}): ModelInfo => ({
  key,
  label: key,
  description: "",
  size_mb: 1,
  engine_id: key,
  variant: "default",
  tags: [],
  capabilities: [],
  supported_languages: [{ code: "en", name: "English" }],
  family: "test",
  category: "local",
  downloadable: true,
  language_selection_mode: "user_select",
  ane_size_mb: null,
  ...options,
});

const installed = (key: string): ModelStatus => ({
  key,
  installed: true,
  ane_installed: false,
  bytes_on_disk: 1,
  missing_files: [],
  directory: `/models/${key}`,
});

describe("model deletion policy", () => {
  test("does nothing when deleting a model that is not selected", () => {
    expect(
      resolveModelDeletionUpdate({
        deletedModel: "other",
        selectedModel: "selected",
        catalog: [model("selected")],
        statusByModel: { selected: installed("selected") },
        appLocale: "system",
        systemLocale: "en-US",
        language: "en",
        remoteSpeechActive: false,
      }),
    ).toBeNull();
  });

  test("prefers an installed downloadable replacement", () => {
    expect(
      resolveModelDeletionUpdate({
        deletedModel: "selected",
        selectedModel: "selected",
        catalog: [
          model("selected"),
          model("bundled", { downloadable: false }),
          model("downloadable"),
        ],
        statusByModel: {
          bundled: installed("bundled"),
          downloadable: installed("downloadable"),
        },
        appLocale: "system",
        systemLocale: "en-US",
        language: "en",
        remoteSpeechActive: false,
      }),
    ).toEqual({ localModel: "downloadable" });
  });

  test("uses the locale for an empty explicit language", () => {
    expect(
      resolveModelDeletionUpdate({
        deletedModel: "selected",
        selectedModel: "selected",
        catalog: [
          model("replacement", {
            supported_languages: [{ code: "es", name: "Español" }],
          }),
        ],
        statusByModel: { replacement: installed("replacement") },
        appLocale: "es",
        systemLocale: "en-US",
        language: "",
        remoteSpeechActive: false,
      }),
    ).toEqual({ localModel: "replacement", language: "es" });
  });

  test("clears an unsupported language for local transcription", () => {
    expect(
      resolveModelDeletionUpdate({
        deletedModel: "selected",
        selectedModel: "selected",
        catalog: [model("replacement")],
        statusByModel: { replacement: installed("replacement") },
        appLocale: "system",
        systemLocale: "en-US",
        language: "fr",
        remoteSpeechActive: false,
      }),
    ).toEqual({ localModel: "replacement", language: "" });
  });
});
