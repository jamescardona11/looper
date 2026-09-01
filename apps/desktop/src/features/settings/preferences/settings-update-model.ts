import { resolvedLlmEndpoint } from "../../../shared/lib/llmProviders";
import { resolvedSpeechEndpoint } from "../../../shared/lib/speechProviders";
import { languageSupportedByModel } from "../../../shared/lib/transcriptionLanguages";
import type { ModelInfo, ShortcutBindings } from "../../../contracts/index";
import {
  getPrimaryShortcut,
  recoverInvalidShortcutDraft,
  removeShortcutCleanup,
  type InvalidShortcutDraft,
  type ShortcutOverrides,
  type ShortcutTarget,
} from "./settings-shortcut-model";
import type { SettingsDraft } from "./useSettingsDraft";

export type SettingsSaveOverrides = ShortcutOverrides & {
  calendarMeetingAwarenessEnabled?: boolean;
  localModel?: string;
  language?: string;
  shortcutBindings?: ShortcutBindings;
  shortcutDraftTarget?: ShortcutTarget;
};

type ShortcutDraftSnapshot = {
  smartShortcut: string;
  smartEnabled: boolean;
  holdShortcut: string;
  holdEnabled: boolean;
  toggleShortcut: string;
  toggleEnabled: boolean;
  bindings: ShortcutBindings;
  persistedBindings: ShortcutBindings;
  invalidDraft: InvalidShortcutDraft;
};

export type SettingsUpdateContext = {
  draft: SettingsDraft;
  shortcuts: ShortcutDraftSnapshot;
  modelCatalog: ModelInfo[];
  licenseGateActive: boolean;
  llmConfigReady: boolean;
  remoteSpeechActive: boolean;
  aiFeaturesReady: boolean;
  autoDictionarySupported: boolean;
};

export function buildSettingsUpdateArgs(
  context: SettingsUpdateContext,
  overrides: SettingsSaveOverrides = {},
) {
  const { draft, shortcuts } = context;
  const shortcutBindings = prepareShortcutBindings(context, overrides);
  const modelToValidate = context.modelCatalog.find(
    (model) => model.key === (overrides.localModel ?? draft.localModel),
  );
  const language = resolvePersistedLanguage(
    context,
    modelToValidate,
    overrides.language,
  );
  const { textSizeMode: localTextSize, ...persistedDraft } = draft;
  void localTextSize;

  return {
    ...persistedDraft,
    calendarMeetingAwarenessEnabled:
      overrides.calendarMeetingAwarenessEnabled ??
      draft.calendarMeetingAwarenessEnabled,
    smartShortcut:
      overrides.smartShortcut ??
      getPrimaryShortcut(shortcutBindings, "smart", shortcuts.smartShortcut),
    smartEnabled: shortcuts.smartEnabled,
    holdShortcut:
      overrides.holdShortcut ??
      getPrimaryShortcut(shortcutBindings, "hold", shortcuts.holdShortcut),
    holdEnabled: shortcuts.holdEnabled,
    toggleShortcut:
      overrides.toggleShortcut ??
      getPrimaryShortcut(shortcutBindings, "toggle", shortcuts.toggleShortcut),
    toggleEnabled: shortcuts.toggleEnabled,
    shortcutBindings,
    localModel: overrides.localModel ?? draft.localModel,
    remoteSpeechEndpoint: resolvedSpeechEndpoint(
      draft.remoteSpeechProvider,
      draft.remoteSpeechEndpoint,
    ),
    language,
    llmEnabled:
      context.licenseGateActive && draft.llmEnabled && context.llmConfigReady,
    cleanupEnabled: false,
    llmEndpoint: resolvedLlmEndpoint(draft.llmProvider, draft.llmEndpoint),
    editModeEnabled: context.aiFeaturesReady ? draft.editModeEnabled : false,
    autoDictionaryEnabled: context.autoDictionarySupported
      ? draft.autoDictionaryEnabled
      : false,
  };
}

function prepareShortcutBindings(
  { shortcuts, aiFeaturesReady }: SettingsUpdateContext,
  overrides: SettingsSaveOverrides,
) {
  const proposed = overrides.shortcutBindings ?? shortcuts.bindings;
  const isExplicitDraft =
    overrides.shortcutBindings !== undefined &&
    overrides.shortcutDraftTarget !== undefined;
  const recovered = isExplicitDraft
    ? proposed
    : recoverInvalidShortcutDraft(
        proposed,
        shortcuts.invalidDraft,
        shortcuts.persistedBindings,
      );
  return aiFeaturesReady ? recovered : removeShortcutCleanup(recovered);
}

function resolvePersistedLanguage(
  context: SettingsUpdateContext,
  model: ModelInfo | undefined,
  override: string | undefined,
) {
  if (override !== undefined) return override;
  if (
    !context.remoteSpeechActive &&
    model &&
    !languageSupportedByModel(model, context.draft.language)
  ) {
    return "";
  }
  return context.draft.language;
}
