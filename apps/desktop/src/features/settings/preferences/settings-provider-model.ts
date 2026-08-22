import * as llmProviderRules from "../../../shared/lib/llmProviders";
import * as speechProviderRules from "../../../shared/lib/speechProviders";
import * as languageRules from "../../../shared/lib/transcriptionLanguages";
import * as modelCapabilityRules from "../../../shared/lib/modelCapabilities";
import type { ModelInfo } from "../../../contracts/index";
import type { SettingsDraft } from "./useSettingsDraft";

export type LanguageGuidanceKind = "remote" | "auto" | "required";

type ProviderStateInput = {
  draft: SettingsDraft;
  modelCatalog: ModelInfo[];
  licenseGateActive: boolean;
  systemLocale: string;
  unsupportedLanguageLabel: string;
  unsupportedLanguageDescription: string;
};

export function deriveSettingsProviderState({
  draft,
  modelCatalog,
  licenseGateActive,
  systemLocale,
  unsupportedLanguageLabel,
  unsupportedLanguageDescription,
}: ProviderStateInput) {
  const localModel = modelCatalog.find(
    (model) => model.key === draft.localModel,
  );
  const writingPreset = llmProviderRules.getProviderPreset(draft.llmProvider);
  const speechPreset = speechProviderRules.getSpeechProviderPreset(
    draft.remoteSpeechProvider,
  );
  const llmConfigReady = Boolean(
    writingPreset &&
    llmProviderRules.resolvedLlmEndpoint(
      draft.llmProvider,
      draft.llmEndpoint,
    ) &&
    (!writingPreset.apiKeyRequired || draft.llmApiKey.trim()) &&
    draft.llmModel.trim(),
  );
  const remoteSpeechConfigReady = Boolean(
    speechPreset &&
    speechProviderRules.resolvedSpeechEndpoint(
      draft.remoteSpeechProvider,
      draft.remoteSpeechEndpoint,
    ) &&
    speechProviderRules.resolvedSpeechModel(
      draft.remoteSpeechProvider,
      draft.remoteSpeechModel,
    ) &&
    (!speechPreset.apiKeyRequired || draft.remoteSpeechApiKey.trim()),
  );
  const remoteSpeechActive =
    draft.remoteSpeechEnabled && remoteSpeechConfigReady;
  const allLanguages =
    languageRules.collectAllTranscriptionLanguages(modelCatalog);
  const languages = languageRules.buildActiveTranscriptionLanguageOptions(
    localModel,
    allLanguages,
    remoteSpeechActive,
    unsupportedLanguageLabel,
    unsupportedLanguageDescription,
  );
  const language = languageRules.resolveTranscriptionLanguage(
    draft.language,
    languages,
    draft.appLocale === "system" ? systemLocale : draft.appLocale,
  );
  const autoDictionarySupported =
    remoteSpeechActive ||
    modelCapabilityRules.hasModelCapability(
      localModel,
      modelCapabilityRules.MODEL_CAPABILITY_DICTIONARY,
    );

  return {
    activeLocalModel: localModel,
    llmConfigReady,
    remoteSpeechConfigReady,
    remoteSpeechActive,
    languages,
    language,
    languageGuidance: resolveLanguageGuidance(remoteSpeechActive, localModel),
    autoDictionarySupported,
    aiFeaturesReady: licenseGateActive && draft.llmEnabled && llmConfigReady,
  };
}

function resolveLanguageGuidance(
  remoteSpeechActive: boolean,
  localModel: ModelInfo | undefined,
): LanguageGuidanceKind {
  if (remoteSpeechActive) return "remote";
  return localModel?.language_selection_mode === "auto_detect"
    ? "auto"
    : "required";
}
