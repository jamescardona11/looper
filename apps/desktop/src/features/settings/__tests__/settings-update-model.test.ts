import { describe, expect, test } from "vitest";

import type {
  ModelInfo,
  ShortcutBindings,
  StoredSettings,
} from "../../../types";
import { createDefaultShortcutBindings } from "../settings-shortcut-model";
import {
  buildSettingsUpdateArgs,
  type SettingsUpdateContext,
} from "../settings-update-model";
import { draftFromStoredSettings } from "../useSettingsDraft";

const model: ModelInfo = {
  key: "local-model",
  label: "Local",
  description: "",
  size_mb: 1,
  engine_id: "local",
  variant: "default",
  tags: [],
  capabilities: [],
  supported_languages: [{ code: "en", name: "English" }],
  family: "test",
  category: "local",
  downloadable: true,
  language_selection_mode: "user_select",
  ane_size_mb: null,
};

const binding = (shortcut: string, cleanupEnabled = false) => ({
  shortcut,
  temporary: false,
  cleanup_enabled: cleanupEnabled,
});

const createContext = (): SettingsUpdateContext => {
  const bindings = createDefaultShortcutBindings("macos");
  return {
    draft: draftFromStoredSettings(
      {
        transcription_mode: "local",
        local_model: model.key,
        microphone_device: null,
        language: "en",
        llm_enabled: true,
        llm_provider: "openrouter",
        llm_endpoint: "",
        llm_api_key: "key",
        llm_model: "model",
        edit_mode_enabled: true,
        auto_dictionary_enabled: true,
      } as StoredSettings,
      "large",
    ),
    shortcuts: {
      smartShortcut: "Fn",
      smartEnabled: true,
      holdShortcut: "Control+Shift+Space",
      holdEnabled: false,
      toggleShortcut: "Control+Alt+Space",
      toggleEnabled: false,
      bindings,
      persistedBindings: bindings,
      invalidDraft: null,
    },
    modelCatalog: [model],
    licenseGateActive: true,
    llmConfigReady: true,
    remoteSpeechActive: false,
    aiFeaturesReady: true,
    autoDictionarySupported: true,
  };
};

describe("settings update model", () => {
  test("persists the draft without local-only text size state", () => {
    const args = buildSettingsUpdateArgs(createContext());

    expect("textSizeMode" in args).toBe(false);
    expect(args.localModel).toBe(model.key);
    expect(args.smartShortcut).toBe("Fn");
    expect(args.llmEndpoint).toBe("https://openrouter.ai/api/v1");
  });

  test("disables gated behaviors when AI features are unavailable", () => {
    const context = createContext();
    context.aiFeaturesReady = false;
    context.licenseGateActive = false;
    context.autoDictionarySupported = false;
    context.shortcuts.bindings = {
      ...context.shortcuts.bindings,
      smart: [binding("Fn", true)],
    };

    const args = buildSettingsUpdateArgs(context);

    expect(args.llmEnabled).toBe(false);
    expect(args.editModeEnabled).toBe(false);
    expect(args.autoDictionaryEnabled).toBe(false);
    expect(args.shortcutBindings.smart[0]?.cleanup_enabled).toBe(false);
  });

  test("recovers an invalid persisted binding outside an explicit draft save", () => {
    const context = createContext();
    const persisted = context.shortcuts.persistedBindings;
    context.shortcuts.bindings = {
      ...persisted,
      smart: [binding("Invalid")],
    };
    context.shortcuts.invalidDraft = {
      target: { mode: "smart", index: 0 },
      message: "Conflict",
    };

    expect(buildSettingsUpdateArgs(context).shortcutBindings).toEqual(
      persisted,
    );

    const explicitBindings: ShortcutBindings = context.shortcuts.bindings;
    expect(
      buildSettingsUpdateArgs(context, {
        shortcutBindings: explicitBindings,
        shortcutDraftTarget: { mode: "smart", index: 0 },
      }).shortcutBindings,
    ).toEqual(explicitBindings);
  });

  test("clears a language unsupported by the selected local model", () => {
    const context = createContext();
    context.draft.language = "fr";

    expect(buildSettingsUpdateArgs(context).language).toBe("");
    expect(buildSettingsUpdateArgs(context, { language: "fr" }).language).toBe(
      "fr",
    );
  });
});
