import { useCallback, useEffect, useRef } from "react";

import { updateSettings } from "../../../data/settings";
import type { StoredSettings } from "../../../contracts/index";
import type { SettingsSaveOverrides } from "./settings-update-model";

type SettingsPersistenceOptions<TArgs extends { localModel: string }> = {
  enabled: boolean;
  loading: boolean;
  canAutosave: boolean;
  settings: StoredSettings | undefined;
  settingsError: unknown;
  buildArgs: (overrides?: SettingsSaveOverrides) => TArgs;
  onHydrate: (settings: StoredSettings, previous?: StoredSettings) => boolean;
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
  const settingsHydratedRef = useRef(false);
  const hydrationRenderPendingRef = useRef(false);
  const baselineSettingsRef = useRef<StoredSettings | null>(null);
  const saveQueueRef = useRef(Promise.resolve(true));
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyIncomingSettings = useCallback(
    (incoming: StoredSettings) => {
      const previous = baselineSettingsRef.current;
      if (previous && storedSettingsAreEqual(previous, incoming)) return;

      baselineSettingsRef.current = incoming;
      settingsHydratedRef.current = true;
      hydrationRenderPendingRef.current = onHydrate(
        incoming,
        previous ?? undefined,
      );
    },
    [onHydrate],
  );

  const latestBuildArgsRef = useRef(buildArgs);
  useEffect(() => {
    latestBuildArgsRef.current = buildArgs;
  }, [buildArgs]);

  const saveNow = useCallback(
    (overrides?: SettingsSaveOverrides) => {
      const queuedSave = saveQueueRef.current
        .catch(() => false)
        .then(async () => {
          // Build when this save actually reaches the front of the queue. A
          // previous save may still be in flight while a local edit or an
          // external settings event rebases the draft.
          const args = latestBuildArgsRef.current(overrides);
          if (overrides?.localModel !== undefined && !args.localModel) {
            return false;
          }
          const baselineAtStart = baselineSettingsRef.current;
          try {
            const saved = await updateSettings(args);
            const currentBaseline = baselineSettingsRef.current;
            if (
              currentBaseline === null ||
              currentBaseline === baselineAtStart ||
              storedSettingsAreEqual(currentBaseline, saved)
            ) {
              baselineSettingsRef.current = saved;
              settingsHydratedRef.current = true;
            }
            onSaved(args, overrides);
            return true;
          } catch (error) {
            console.error(error);
            onSaveFailed(error, overrides);
            return false;
          }
        });
      saveQueueRef.current = queuedSave;
      return queuedSave;
    },
    [onSaveFailed, onSaved],
  );

  const latestSaveRef = useRef(saveNow);
  useEffect(() => {
    latestSaveRef.current = saveNow;
  }, [saveNow]);

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
    if (settings) applyIncomingSettings(settings);
  }, [
    applyIncomingSettings,
    enabled,
    onSettingsError,
    settings,
    settingsError,
  ]);

  useEffect(() => {
    if (!enabled || loading || !canAutosave || !settingsHydratedRef.current) {
      return;
    }
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (hydrationRenderPendingRef.current) {
      hydrationRenderPendingRef.current = false;
      return;
    }

    cancelScheduledSave();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void latestSaveRef.current();
    }, 500);
  }, [buildArgs, cancelScheduledSave, canAutosave, enabled, loading]);

  useEffect(() => {
    if (enabled) return;
    flushScheduledSave();
    hydratedRef.current = false;
    settingsHydratedRef.current = false;
    hydrationRenderPendingRef.current = false;
    baselineSettingsRef.current = null;
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

function storedSettingsAreEqual(
  left: StoredSettings,
  right: StoredSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
