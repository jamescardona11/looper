import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { setShortcutCaptureActive } from "../../data/settings";
import { useShortcutCapture } from "../../shared/hooks/useShortcutCapture";
import type {
  ShortcutBinding,
  ShortcutBindings,
  StoredSettings,
} from "../../types";
import {
  createDefaultShortcutBindings,
  getPrimaryShortcut,
  indexInvalidShortcutDraft,
  recoverInvalidShortcutDraft,
  removeShortcutCleanup,
  resolveDefaultSmartShortcut,
  restoreShortcutBindings,
  type InvalidShortcutDraft,
  type ShortcutCaptureTarget,
  type ShortcutMode,
  type ShortcutTarget,
} from "./settings-shortcut-model";
import type { SettingsSaveOverrides } from "./settings-update-model";

type ShortcutEditorState = {
  primary: Record<ShortcutMode, string>;
  enabled: Record<ShortcutMode, boolean>;
  bindings: ShortcutBindings;
  persistedBindings: ShortcutBindings;
  invalidDraft: InvalidShortcutDraft;
  capture: ShortcutCaptureTarget;
  preview: string;
};

export type ShortcutPersistencePort = {
  save: (overrides: SettingsSaveOverrides) => void;
  cancelScheduledSave: () => void;
  flushScheduledSave: () => void;
};

type ShortcutEditorOptions = {
  enabled: boolean;
  aiFeaturesReady: boolean;
  persistence: ShortcutPersistencePort;
  clearError: () => void;
  showError: (message: string) => void;
  onClose: () => void;
};

type CaptureBridge = {
  cancel: () => void;
  cancelled: () => void;
  preview: (value: string) => void;
  captured: (shortcut: string) => void;
  error: (message: string) => void;
  input: () => void;
};

export function useShortcutEditor({
  enabled,
  aiFeaturesReady,
  persistence,
  clearError,
  showError,
  onClose,
}: ShortcutEditorOptions) {
  const [state, setState] = useState(createInitialEditorState);
  const stateRef = useRef(state);

  const commit = useCallback(
    (update: (current: ShortcutEditorState) => ShortcutEditorState) => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  const clearErrorIfValid = useCallback(() => {
    if (!stateRef.current.invalidDraft) clearError();
  }, [clearError]);

  const captureBridgeRef = useRef<CaptureBridge>({
    cancel: () => {},
    cancelled: () => {},
    preview: () => {},
    captured: () => {},
    error: () => {},
    input: () => {},
  });
  const { resetCaptureState } = useShortcutCapture({
    active: state.capture !== null,
    onCancel: () => captureBridgeRef.current.cancel(),
    onCaptureCancelled: () => captureBridgeRef.current.cancelled(),
    onPreviewChange: (value) => captureBridgeRef.current.preview(value),
    onShortcutCaptured: (shortcut) =>
      captureBridgeRef.current.captured(shortcut),
    onError: (message) => captureBridgeRef.current.error(message),
    onCaptureInput: () => captureBridgeRef.current.input(),
  });

  const clearInvalidDraft = useCallback(() => {
    commit((current) =>
      current.invalidDraft ? { ...current, invalidDraft: null } : current,
    );
  }, [commit]);

  const discardInvalidDraft = useCallback(() => {
    commit((current) => {
      if (!current.invalidDraft) return current;
      const bindings = recoverInvalidShortcutDraft(
        current.bindings,
        current.invalidDraft,
        current.persistedBindings,
      );
      return withBindings({ ...current, invalidDraft: null }, bindings);
    });
  }, [commit]);

  const discardEmptyCaptureDraft = useCallback(() => {
    commit((current) => {
      const target = current.capture;
      if (!target) return current;

      const modeBindings = current.bindings[target.mode];
      const binding = modeBindings[target.index];
      const bindings =
        binding?.shortcut.trim() === "" && modeBindings.length > 1
          ? {
              ...current.bindings,
              [target.mode]: modeBindings.filter(
                (_item, index) => index !== target.index,
              ),
            }
          : current.bindings;
      return withBindings({ ...current, capture: null }, bindings);
    });
  }, [commit]);

  const finalizeCapture = useCallback(async () => {
    persistence.flushScheduledSave();
    commit((current) =>
      current.capture ? { ...current, capture: null } : current,
    );
    await setShortcutCaptureActive(false).catch(() => {});
  }, [commit, persistence]);

  const saveBindings = useCallback(
    (bindings: ShortcutBindings, draftTarget?: ShortcutTarget) => {
      const next = commit((current) => withBindings(current, bindings));
      persistence.save({
        shortcutBindings: bindings,
        ...(draftTarget ? { shortcutDraftTarget: draftTarget } : {}),
        smartShortcut: next.primary.smart,
        holdShortcut: next.primary.hold,
        toggleShortcut: next.primary.toggle,
      });
    },
    [commit, persistence],
  );

  const handleCapturedShortcut = useCallback(
    (shortcut: string) => {
      persistence.cancelScheduledSave();
      const target = stateRef.current.capture;
      if (!target) return;

      const bindings = replaceShortcut(
        stateRef.current.bindings,
        target,
        shortcut,
      );
      saveBindings(bindings, target);
      commit((current) => ({ ...current, capture: null }));
      clearErrorIfValid();
    },
    [clearErrorIfValid, commit, persistence, saveBindings],
  );

  captureBridgeRef.current = {
    cancel: () => void finalizeCapture(),
    cancelled: discardEmptyCaptureDraft,
    preview: (preview) =>
      commit((current) =>
        current.preview === preview ? current : { ...current, preview },
      ),
    captured: handleCapturedShortcut,
    error: showError,
    input: clearErrorIfValid,
  };

  const startCapture = useCallback(
    (mode: ShortcutMode, index = 0) => {
      discardInvalidDraft();
      const currentTarget = stateRef.current.capture;
      if (currentTarget?.mode === mode && currentTarget.index === index) {
        void finalizeCapture();
        resetCaptureState();
        clearErrorIfValid();
        return;
      }

      resetCaptureState();
      const target = { mode, index };
      commit((current) => ({ ...current, capture: target }));
      clearErrorIfValid();
      void setShortcutCaptureActive(true).catch((error) => {
        console.error("Failed to disable shortcuts for capture", error);
        commit((current) => ({ ...current, capture: null }));
        resetCaptureState();
        showError(String(error));
      });
    },
    [
      clearErrorIfValid,
      commit,
      discardInvalidDraft,
      finalizeCapture,
      resetCaptureState,
      showError,
    ],
  );

  const updateBinding = useCallback(
    (mode: ShortcutMode, index: number, patch: Partial<ShortcutBinding>) => {
      if (patch.shortcut !== undefined) discardInvalidDraft();
      persistence.cancelScheduledSave();
      const bindings = patchBinding(
        stateRef.current.bindings,
        mode,
        index,
        patch,
      );
      saveBindings(bindings);
    },
    [discardInvalidDraft, persistence, saveBindings],
  );

  const addBinding = useCallback(
    (mode: ShortcutMode) => {
      persistence.cancelScheduledSave();
      discardInvalidDraft();
      const current = stateRef.current.bindings;
      if (current[mode].length >= 3) return;

      const index = current[mode].length;
      const bindings = {
        ...current,
        [mode]: [...current[mode], createEmptyBinding()],
      };
      commit((editor) => withBindings(editor, bindings));
      startCapture(mode, index);
    },
    [commit, discardInvalidDraft, persistence, startCapture],
  );

  const removeBinding = useCallback(
    (mode: ShortcutMode, index: number) => {
      const current = stateRef.current;
      if (current.bindings[mode].length <= 1) return;
      discardInvalidDraft();

      let capture = current.capture;
      if (capture?.mode === mode) {
        if (capture.index === index) {
          capture = null;
          resetCaptureState();
          void setShortcutCaptureActive(false).catch(() => {});
        } else if (capture.index > index) {
          capture = { ...capture, index: capture.index - 1 };
        }
      }

      const bindings = {
        ...stateRef.current.bindings,
        [mode]: stateRef.current.bindings[mode].filter(
          (_binding, bindingIndex) => bindingIndex !== index,
        ),
      };
      commit((editor) => withBindings({ ...editor, capture }, bindings));
      persistence.cancelScheduledSave();
      saveBindings(bindings);
    },
    [commit, discardInvalidDraft, persistence, resetCaptureState, saveBindings],
  );

  const hydrate = useCallback(
    (settings: StoredSettings) => {
      const bindings = restoreShortcutBindings(settings);
      commit(() => ({
        primary: {
          smart: settings.smart_shortcut,
          hold: settings.hold_shortcut,
          toggle: settings.toggle_shortcut,
        },
        enabled: {
          smart: settings.smart_enabled,
          hold: settings.hold_enabled,
          toggle: settings.toggle_enabled,
        },
        bindings,
        persistedBindings: bindings,
        invalidDraft: null,
        capture: null,
        preview: "",
      }));
    },
    [commit],
  );

  const acceptSavedBindings = useCallback(
    (bindings: ShortcutBindings, draftTarget?: ShortcutTarget) => {
      commit((current) => ({
        ...current,
        persistedBindings: bindings,
        invalidDraft: draftTarget ? null : current.invalidDraft,
      }));
    },
    [commit],
  );

  const rejectDraft = useCallback(
    (target: ShortcutTarget, message: string) => {
      commit((current) => ({
        ...current,
        invalidDraft: { target, message },
      }));
    },
    [commit],
  );

  const setModeEnabled = useCallback(
    (mode: ShortcutMode, value: boolean) => {
      commit((current) => ({
        ...current,
        enabled: { ...current.enabled, [mode]: value },
      }));
    },
    [commit],
  );

  useEffect(() => {
    if (aiFeaturesReady) return;
    commit((current) =>
      withBindings(current, removeShortcutCleanup(current.bindings)),
    );
  }, [aiFeaturesReady, commit]);

  useEffect(() => {
    if (enabled || !state.capture) return;
    void finalizeCapture();
    resetCaptureState();
  }, [enabled, finalizeCapture, resetCaptureState, state.capture]);

  useEffect(() => {
    if (!enabled) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!stateRef.current.capture) {
        onClose();
        return;
      }
      event.preventDefault();
      void finalizeCapture();
      discardEmptyCaptureDraft();
      resetCaptureState();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    discardEmptyCaptureDraft,
    enabled,
    finalizeCapture,
    onClose,
    resetCaptureState,
  ]);

  useEffect(
    () => () => {
      void setShortcutCaptureActive(false).catch(() => {});
    },
    [],
  );

  const snapshot = useMemo(
    () => ({
      smartShortcut: state.primary.smart,
      smartEnabled: state.enabled.smart,
      holdShortcut: state.primary.hold,
      holdEnabled: state.enabled.hold,
      toggleShortcut: state.primary.toggle,
      toggleEnabled: state.enabled.toggle,
      bindings: state.bindings,
      persistedBindings: state.persistedBindings,
      invalidDraft: state.invalidDraft,
    }),
    [state],
  );

  return {
    snapshot,
    smartShortcut: state.primary.smart,
    smartEnabled: state.enabled.smart,
    setSmartEnabled: (value: boolean) => setModeEnabled("smart", value),
    holdShortcut: state.primary.hold,
    holdEnabled: state.enabled.hold,
    setHoldEnabled: (value: boolean) => setModeEnabled("hold", value),
    toggleShortcut: state.primary.toggle,
    toggleEnabled: state.enabled.toggle,
    setToggleEnabled: (value: boolean) => setModeEnabled("toggle", value),
    shortcutBindings: state.bindings,
    invalidShortcutDrafts: indexInvalidShortcutDraft(state.invalidDraft),
    captureActive: state.capture,
    capturePreview: state.preview,
    startCapture,
    updateBinding,
    addBinding,
    removeBinding,
    hydrate,
    acceptSavedBindings,
    rejectDraft,
    clearInvalidDraft,
    clearErrorIfValid,
  };
}

function createInitialEditorState(): ShortcutEditorState {
  const bindings = createDefaultShortcutBindings();
  return {
    primary: {
      smart: resolveDefaultSmartShortcut(),
      hold: "Control+Shift+Space",
      toggle: "Control+Alt+Space",
    },
    enabled: { smart: true, hold: false, toggle: false },
    bindings,
    persistedBindings: bindings,
    invalidDraft: null,
    capture: null,
    preview: "",
  };
}

function withBindings(
  state: ShortcutEditorState,
  bindings: ShortcutBindings,
): ShortcutEditorState {
  return {
    ...state,
    bindings,
    primary: {
      smart: getPrimaryShortcut(bindings, "smart", state.primary.smart),
      hold: getPrimaryShortcut(bindings, "hold", state.primary.hold),
      toggle: getPrimaryShortcut(bindings, "toggle", state.primary.toggle),
    },
  };
}

function replaceShortcut(
  bindings: ShortcutBindings,
  target: ShortcutTarget,
  shortcut: string,
) {
  return patchBinding(bindings, target.mode, target.index, { shortcut });
}

function patchBinding(
  bindings: ShortcutBindings,
  mode: ShortcutMode,
  index: number,
  patch: Partial<ShortcutBinding>,
): ShortcutBindings {
  return {
    ...bindings,
    [mode]: bindings[mode].map((binding, bindingIndex) =>
      bindingIndex === index ? { ...binding, ...patch } : binding,
    ),
  };
}

function createEmptyBinding(): ShortcutBinding {
  return { shortcut: "", temporary: false, cleanup_enabled: false };
}
