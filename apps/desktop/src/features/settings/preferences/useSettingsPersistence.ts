import { useCallback, useEffect, useRef } from "react";

import { updateSettings } from "../../../data/settings";
import type { StoredSettings } from "../../../types/index";
import type { SettingsSaveOverrides } from "./settings-update-model";

type SettingsPersistenceOptions<TArgs extends { localModel: string }> = {
  enabled: boolean;
  loading: boolean;
  canAutosave: boolean;
  settings: StoredSettings | undefined;
  settingsError: unknown;
  buildArgs: (overrides?: SettingsSaveOverrides) => TArgs;
  onHydrate: (settings: StoredSettings) => void;
  onSettingsError: (error: unknown) => void;
  onSaved: (args: TArgs, overrides?: SettingsSaveOverrides) => void;
  onSaveFailed: (error: unknown, overrides?: SettingsSaveOverrides) => void;
};

export function useSettingsPersistence<TArgs extends { localModel: string }>({
  enabled,
  loading,
  canAutosave,
  settings,
  settingsError,
  buildArgs,
  onHydrate,
  onSettingsError,
  onSaved,
  onSaveFailed,
}: SettingsPersistenceOptions<TArgs>) {
  const hydratedRef = useRef(false);
  const savingRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve(true));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = useCallback(
    (overrides?: SettingsSaveOverrides) => {
      const args = buildArgs(overrides);
      if (overrides?.localModel !== undefined && !args.localModel) {
        return Promise.resolve(false);
      }

      const queuedSave = saveQueueRef.current
        .catch(() => false)
        .then(async () => {
          savingRef.current = true;
          try {
            await updateSettings(args);
            onSaved(args, overrides);
            return true;
          } catch (error) {
            console.error(error);
            onSaveFailed(error, overrides);
            return false;
          } finally {
            savingRef.current = false;
          }
        });
      saveQueueRef.current = queuedSave;
      return queuedSave;
    },
    [buildArgs, onSaveFailed, onSaved],
  );

  const latestSaveRef = useRef(saveNow);
  latestSaveRef.current = saveNow;

  const cancelScheduledSave = useCallback(() => {
    if (autosaveTimerRef.current === null) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const flushScheduledSave = useCallback(() => {
    if (autosaveTimerRef.current === null) return;
    cancelScheduledSave();
    void latestSaveRef.current();
  }, [cancelScheduledSave]);

  useEffect(() => {
    if (!enabled) return;
    if (settingsError) {
      onSettingsError(settingsError);
      return;
    }
    if (settings && !savingRef.current) onHydrate(settings);
  }, [enabled, onHydrate, onSettingsError, settings, settingsError]);

  useEffect(() => {
    if (!enabled || loading || !canAutosave) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    cancelScheduledSave();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void latestSaveRef.current();
    }, 500);
  }, [cancelScheduledSave, canAutosave, enabled, loading, saveNow]);

  useEffect(() => {
    if (enabled) return;
    flushScheduledSave();
    hydratedRef.current = false;
  }, [enabled, flushScheduledSave]);

  useEffect(
    () => () => {
      flushScheduledSave();
    },
    [flushScheduledSave],
  );

  return {
    saveNow,
    cancelScheduledSave,
    flushScheduledSave,
  };
}
