import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import {
  getCapturePillPreferences,
  onCapturePillPreferencesChanged,
  setDictationLanguage,
  setPreflightLanguageMenuOpen,
  startDictationFromDock,
  type CapturePillDockPosition,
  type CapturePillPresentation,
} from "../../data/capture/dictation";
import { startNoteFromDock } from "../../data/meeting/notetaking";
import { getSettings } from "../../data/settings";
import { listModels } from "../../data/transcription";
import {
  buildActiveTranscriptionLanguageOptions,
  collectAllTranscriptionLanguages,
  resolveTranscriptionLanguage,
  type TranscriptionLanguageOption,
} from "../../shared/lib/transcriptionLanguages";
import { isRemoteSpeechConfigured } from "../../shared/lib/speechProviders";
import { safeUnlisten } from "../../shared/lib/safeUnlisten";

type PreflightState = {
  language: string;
  languages: TranscriptionLanguageOption[];
  menuOpen: boolean;
  starting: boolean;
  presentation: CapturePillPresentation;
  dockPosition: CapturePillDockPosition;
};

const initialState: PreflightState = {
  language: "",
  languages: [],
  menuOpen: false,
  starting: false,
  presentation: "dock",
  dockPosition: "bottom_center",
};

export function usePillPreflight() {
  const { t } = useLingui();
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [settings, models, preferences] = await Promise.all([
          getSettings(),
          listModels(),
          getCapturePillPreferences(),
        ]);
        if (!mounted) return;

        const chosenModel = models.find(
          ({ key }) => key === settings.local_model,
        );
        const usesRemoteSpeech =
          settings.transcription_mode === "cloud" ||
          isRemoteSpeechConfigured({
            enabled: settings.remote_speech_enabled,
            provider: settings.remote_speech_provider,
            endpoint: settings.remote_speech_endpoint,
            model: settings.remote_speech_model,
          });
        const availableLanguages = buildActiveTranscriptionLanguageOptions(
          chosenModel,
          collectAllTranscriptionLanguages(models),
          usesRemoteSpeech,
          t({
            id: "transcription.language.unsupported",
            message: "Unsupported",
          }),
          t({
            id: "transcription.language.unsupported_description",
            message: "Choose a compatible model to enable these.",
          }),
        );
        const appLanguage =
          settings.app_locale === "system"
            ? navigator.language
            : (settings.app_locale ?? navigator.language);
        const selected = resolveTranscriptionLanguage(
          settings.language,
          availableLanguages,
          appLanguage,
        );

        setState((current) => ({
          ...current,
          presentation: preferences.presentation,
          dockPosition: preferences.dockPosition,
          languages: availableLanguages,
          language: selected,
        }));
        if (selected !== settings.language) {
          await setDictationLanguage(selected);
        }
      } catch (error) {
        console.error("Failed to load Dictation languages:", error);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    let disposed = false;
    let release: (() => void) | undefined;
    void onCapturePillPreferencesChanged((preferences) => {
      if (disposed) return;
      setState((current) => ({
        ...current,
        presentation: preferences.presentation,
        dockPosition: preferences.dockPosition,
        language: preferences.language,
      }));
    }).then((unlisten) => {
      if (disposed) safeUnlisten(unlisten);
      else release = unlisten;
    });
    return () => {
      disposed = true;
      safeUnlisten(release);
    };
  }, []);

  const setMenuOpen = useCallback((open: boolean) => {
    setState((current) => ({ ...current, menuOpen: open }));
    void setPreflightLanguageMenuOpen(open).catch((error) => {
      console.error("Failed to resize Dictation language menu:", error);
    });
  }, []);

  const selectLanguage = useCallback((language: string) => {
    setState((current) => ({ ...current, language, menuOpen: false }));
    void setPreflightLanguageMenuOpen(false).catch((error) => {
      console.error("Failed to resize Dictation language menu:", error);
    });
    void setDictationLanguage(language).catch((error) => {
      console.error("Failed to update Dictation language:", error);
    });
  }, []);

  const beginDictation = useCallback(() => {
    setState((current) => ({ ...current, starting: true }));
    void startDictationFromDock().catch((error) => {
      console.error("Failed to start Dictation from dock:", error);
      setState((current) => ({ ...current, starting: false }));
    });
  }, []);

  const beginNote = useCallback(() => {
    void startNoteFromDock().catch((error) => {
      console.error("Failed to start a note from dock:", error);
    });
  }, []);

  return {
    ...state,
    currentLanguage:
      state.languages.find(({ code }) => code === state.language)?.name ??
      state.language.toUpperCase(),
    setMenuOpen,
    selectLanguage,
    beginDictation,
    beginNote,
  };
}
