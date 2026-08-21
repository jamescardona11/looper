import { languageSupportedByModel } from "../../../shared/lib/transcriptionLanguages";
import type {
  AppLocaleSetting,
  ModelInfo,
  ModelStatus,
} from "../../../contracts/index";

type ModelDeletionContext = {
  deletedModel: string;
  selectedModel: string;
  catalog: ModelInfo[];
  statusByModel: Record<string, ModelStatus>;
  appLocale: AppLocaleSetting;
  systemLocale: string;
  language: string;
  remoteSpeechActive: boolean;
};

export type ModelDeletionUpdate = {
  localModel: string;
  language?: string;
};

export function resolveModelDeletionUpdate({
  deletedModel,
  selectedModel,
  catalog,
  statusByModel,
  appLocale,
  systemLocale,
  language,
  remoteSpeechActive,
}: ModelDeletionContext): ModelDeletionUpdate | null {
  if (deletedModel !== selectedModel) return null;

  const replacement = findReplacementModel(
    deletedModel,
    catalog,
    statusByModel,
  );
  if (!replacement) return null;

  const explicitLanguage = resolveExplicitLanguage(
    replacement,
    language,
    appLocale === "system" ? systemLocale : appLocale,
  );
  const nextLanguage =
    remoteSpeechActive ||
    languageSupportedByModel(replacement, explicitLanguage)
      ? explicitLanguage
      : "";

  return {
    localModel: replacement.key,
    ...(nextLanguage === language ? {} : { language: nextLanguage }),
  };
}

function findReplacementModel(
  deletedModel: string,
  catalog: ModelInfo[],
  statusByModel: Record<string, ModelStatus>,
) {
  const installed = catalog.filter(
    (model) =>
      model.key !== deletedModel &&
      statusByModel[model.key]?.installed === true,
  );
  return installed.find((model) => model.downloadable) ?? installed[0];
}

export function resolveExplicitLanguage(
  model: ModelInfo | undefined,
  language: string,
  preferredLocale: string,
) {
  if (language || model?.language_selection_mode !== "user_select") {
    return language;
  }

  const localeLanguage = preferredLocale.split("-")[0].toLowerCase();
  return languageSupportedByModel(model, localeLanguage)
    ? localeLanguage
    : "en";
}
