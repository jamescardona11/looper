import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";

import { languageSupportedByModel } from "../../shared/lib/transcriptionLanguages";
import type { AppLocaleSetting, ModelInfo, ModelStatus } from "../../types";
import { resolveModelDeletionUpdate } from "./model-deletion-policy";
import type { SettingsSaveOverrides } from "./settings-update-model";
import { useModelTransfers } from "./useModelTransfers";

type SettingsLocalModelsOptions = {
  enabled: boolean;
  catalog: ModelInfo[];
  statusByModel: Record<string, ModelStatus>;
  selectedModel: string;
  appLocale: AppLocaleSetting;
  language: string;
  remoteSpeechActive: boolean;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setLanguage: Dispatch<SetStateAction<string>>;
  cancelScheduledSave: () => void;
  save: (overrides: SettingsSaveOverrides) => Promise<boolean>;
};

export function useSettingsLocalModels({
  enabled,
  catalog,
  statusByModel,
  selectedModel,
  appLocale,
  language,
  remoteSpeechActive,
  setSelectedModel,
  setLanguage,
  cancelScheduledSave,
  save,
}: SettingsLocalModelsOptions) {
  useEffect(() => {
    if (!enabled || catalog.length === 0) return;

    setSelectedModel((current) => {
      if (catalog.some(({ key }) => key === current)) return current;
      return catalog.find(({ downloadable }) => downloadable)?.key ?? "";
    });
  }, [catalog, enabled, setSelectedModel]);

  const select = useCallback(
    (modelKey: string) => {
      cancelScheduledSave();
      const model = catalog.find(({ key }) => key === modelKey);
      const locale = (appLocale === "system" ? navigator.language : appLocale)
        .split("-")[0]
        .toLowerCase();
      const explicitLanguage =
        model?.language_selection_mode === "user_select" && !language
          ? languageSupportedByModel(model, locale)
            ? locale
            : "en"
          : language;
      const nextLanguage =
        remoteSpeechActive || languageSupportedByModel(model, explicitLanguage)
          ? explicitLanguage
          : "";

      setSelectedModel(modelKey);
      setLanguage(nextLanguage);
      void save({ localModel: modelKey, language: nextLanguage });
    },
    [
      appLocale,
      cancelScheduledSave,
      catalog,
      language,
      remoteSpeechActive,
      save,
      setLanguage,
      setSelectedModel,
    ],
  );

  const reconcileDeletedModel = useCallback(
    (deletedModel: string) => {
      const replacement = resolveModelDeletionUpdate({
        deletedModel,
        selectedModel,
        catalog,
        statusByModel,
        appLocale,
        systemLocale: navigator.language,
        language,
        remoteSpeechActive,
      });
      if (!replacement) return;

      setSelectedModel(replacement.localModel);
      if (replacement.language !== undefined) {
        setLanguage(replacement.language);
      }
      cancelScheduledSave();
      void save(replacement);
    },
    [
      appLocale,
      cancelScheduledSave,
      catalog,
      language,
      remoteSpeechActive,
      save,
      selectedModel,
      setLanguage,
      setSelectedModel,
      statusByModel,
    ],
  );

  const transfers = useModelTransfers({
    enabled,
    onModelDeleted: reconcileDeletedModel,
  });

  return {
    select,
    downloadState: transfers.downloadState,
    download: transfers.download,
    remove: transfers.remove,
    cancelDownload: transfers.cancel,
  };
}
