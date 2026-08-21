import { describe, expect, test } from "vitest";

import type { ModelInfo, StoredSettings } from "../../../../contracts/index";
import { deriveSettingsProviderState } from "../settings-provider-model";
import { draftFromStoredSettings } from "../useSettingsDraft";

const model: ModelInfo = {
  key: "local",
  label: "Local",
  description: "",
  size_mb: 1,
  engine_id: "local",
  variant: "default",
  tags: [],
  capabilities: ["dictionary"],
  supported_languages: [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
  ],
  family: "test",
  category: "local",
  downloadable: true,
  language_selection_mode: "user_select",
  ane_size_mb: null,
};

const createDraft = () =>
  draftFromStoredSettings(
    {
      transcription_mode: "local",
      local_model: model.key,
      microphone_device: null,
      language: "es",
      app_locale: "system",
      llm_enabled: true,
      llm_provider: "openrouter",
      llm_endpoint: "",
      llm_api_key: "key",
      llm_model: "writing-model",
    } as StoredSettings,
    "default",
  );

const derive = (draft = createDraft(), licenseGateActive = true) =>
  deriveSettingsProviderState({
    draft,
    modelCatalog: [model],
    licenseGateActive,
    systemLocale: "en-US",
    unsupportedLanguageLabel: "Unsupported",
    unsupportedLanguageDescription: "Choose another model",
  });

describe("settings provider model", () => {
  test("enables configured writing features behind the active gate", () => {
    expect(derive().llmConfigReady).toBe(true);
    expect(derive().aiFeaturesReady).toBe(true);
    expect(derive(createDraft(), false).aiFeaturesReady).toBe(false);
  });

  test("keeps the local language and dictionary capability", () => {
    const state = derive();

    expect(state.language).toBe("es");
    expect(state.languages.map(({ code }) => code)).toContain("es");
    expect(state.languageGuidance).toBe("required");
    expect(state.autoDictionarySupported).toBe(true);
  });

  test("switches guidance when remote speech is configured", () => {
    const draft = createDraft();
    draft.remoteSpeechEnabled = true;
    draft.remoteSpeechProvider = "openai";
    draft.remoteSpeechApiKey = "speech-key";
    draft.remoteSpeechModel = "gpt-4o-mini-transcribe";

    const state = derive(draft);

    expect(state.remoteSpeechActive).toBe(true);
    expect(state.languageGuidance).toBe("remote");
  });
});
