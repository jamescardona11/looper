import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  buildSettingsUpdateArgs,
  type SettingsSaveOverrides,
} from "./settings-update-model";
import {
  formatByteCount,
  useSettingsAppActions,
} from "./useSettingsAppActions";
import { useSettingsDraft } from "./useSettingsDraft";
import { useSettingsErrors } from "./useSettingsErrors";
import { useSettingsLocalModels } from "./useSettingsLocalModels";
import { useSettingsPersistence } from "./useSettingsPersistence";
import { useSettingsProviderControls } from "../providers/useSettingsProviderControls";
import { useSettingsResources } from "./useSettingsResources";
import {
  useShortcutEditor,
  type ShortcutPersistencePort,
} from "../shortcuts/useShortcutEditor";
import type { TranscriptionMode, StoredSettings } from "../../../types/index";

type ActiveTab =
  "general" | "models" | "providers" | "about" | "account" | "sync" | "app";

interface UseSettingsFormOptions {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ActiveTab;
  transcriptionMode: TranscriptionMode;
}

export function useSettingsForm({
  isOpen,
  onClose,
  initialTab = "general",
  transcriptionMode: initialTranscriptionMode,
}: UseSettingsFormOptions) {
  const shortcutPersistenceRef = useRef<ShortcutPersistencePort>({
    save: () => {},
    cancelScheduledSave: () => {},
    flushScheduledSave: () => {},
  });
  const shortcutPersistence = useMemo<ShortcutPersistencePort>(
    () => ({
      save: (overrides) => shortcutPersistenceRef.current.save(overrides),
      cancelScheduledSave: () =>
        shortcutPersistenceRef.current.cancelScheduledSave(),
      flushScheduledSave: () =>
        shortcutPersistenceRef.current.flushScheduledSave(),
    }),
    [],
  );
  const {
    draft: settingsDraft,
    setters: draftSetters,
    hydrate: hydrateSettingsDraft,
  } = useSettingsDraft(initialTranscriptionMode);
  const {
    transcriptionMode,
    localModel,
    remoteSpeechEnabled,
    remoteSpeechProvider,
    remoteSpeechEndpoint,
    remoteSpeechApiKey,
    remoteSpeechModel,
    microphoneDevice,
    language,
    appLocale,
    llmEnabled,
    llmProvider,
    llmEndpoint,
    llmApiKey,
    llmModel,
    meetingAiProvider,
    localLlmModel,
    editModeEnabled,
    previewBeforeInsertEnabled,
    previewBeforeInsertSelectionEnabled,
    useScreenContext,
    autoDictionaryEnabled,
    mediaAction,
    autoUpdateEnabled,
    autoLaunchEnabled,
    startInBackground,
    calendarMeetingAwarenessEnabled,
    autoDeleteTarget,
    autoDeleteDuration,
    audioStorageBudgetMb,
    hideOverlaysFromCapture,
    markdownMirrorEnabled,
    markdownMirrorPath,
    analyticsEnabled,
    textSizeMode,
    themeMode,
  } = settingsDraft;
  const {
    transcriptionMode: setTranscriptionModeRaw,
    localModel: setLocalModel,
    remoteSpeechEnabled: setRemoteSpeechEnabled,
    remoteSpeechProvider: setRemoteSpeechProviderRaw,
    remoteSpeechEndpoint: setRemoteSpeechEndpointRaw,
    remoteSpeechApiKey: setRemoteSpeechApiKey,
    remoteSpeechModel: setRemoteSpeechModel,
    microphoneDevice: setMicrophoneDevice,
    language: setLanguage,
    appLocale: setAppLocale,
    llmEnabled: setLlmEnabledRaw,
    llmProvider: setLlmProviderRaw,
    llmEndpoint: setLlmEndpointRaw,
    llmApiKey: setLlmApiKeyRaw,
    llmModel: setLlmModel,
    meetingAiProvider: setMeetingAiProvider,
    localLlmModel: setLocalLlmModel,
    editModeEnabled: setEditModeEnabled,
    previewBeforeInsertEnabled: setPreviewBeforeInsertEnabled,
    previewBeforeInsertSelectionEnabled: setPreviewBeforeInsertSelectionEnabled,
    useScreenContext: setUseScreenContextState,
    autoDictionaryEnabled: setAutoDictionaryEnabled,
    mediaAction: setMediaAction,
    autoUpdateEnabled: setAutoUpdateEnabled,
    autoLaunchEnabled: setAutoLaunchEnabledState,
    startInBackground: setStartInBackground,
    calendarMeetingAwarenessEnabled: setCalendarMeetingAwarenessEnabled,
    autoDeleteTarget: setAutoDeleteTarget,
    autoDeleteDuration: setAutoDeleteDuration,
    audioStorageBudgetMb: setAudioStorageBudgetMb,
    hideOverlaysFromCapture: setHideOverlaysFromCapture,
    markdownMirrorEnabled: setMarkdownMirrorEnabled,
    markdownMirrorPath: setMarkdownMirrorPath,
    analyticsEnabled: setAnalyticsEnabled,
    textSizeMode: setTextSizeModeRaw,
    themeMode: setThemeModeRaw,
  } = draftSetters;
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  const [showFAQModal, setShowFAQModal] = useState(false);
  const settingsErrors = useSettingsErrors(activeTab);
  const resources = useSettingsResources({
    enabled: isOpen,
    permissionsVisible: activeTab === "app",
  });
  const { loading } = resources;
  const { gateActive: licenseGateActive, active: activeLicense } =
    resources.license;
  const { info: appInfo, inputs: inputDevices, permissions } = resources.app;
  const { catalog: modelCatalog, statusByKey: modelStatus } = resources.models;
  const {
    status: cliInstallStatus,
    busy: cliInstallBusy,
    install: installCliAsync,
    remove: removeCliAsync,
  } = resources.cli;
  const {
    platformCapabilities,
    microphone: micPermission,
    accessibility: accessibilityPermission,
    inputMonitoring: inputMonitoringPermission,
    requestMicrophone: handleRequestMicrophonePermission,
  } = permissions;

  const clearShortcutErrorRef = useRef(settingsErrors.clear);
  const clearSettingsErrorIfNoInvalidDrafts = useCallback(
    () => clearShortcutErrorRef.current(),
    [],
  );

  const providerActions = useMemo(
    () => ({
      setLanguage,
      setLlmProvider: setLlmProviderRaw,
      setLlmEndpoint: setLlmEndpointRaw,
      setLlmApiKey: setLlmApiKeyRaw,
      setLlmModel,
      setRemoteSpeechProvider: setRemoteSpeechProviderRaw,
      setRemoteSpeechEndpoint: setRemoteSpeechEndpointRaw,
      setRemoteSpeechApiKey,
      setRemoteSpeechModel,
    }),
    [
      setLanguage,
      setLlmApiKeyRaw,
      setLlmEndpointRaw,
      setLlmModel,
      setLlmProviderRaw,
      setRemoteSpeechApiKey,
      setRemoteSpeechEndpointRaw,
      setRemoteSpeechModel,
      setRemoteSpeechProviderRaw,
    ],
  );
  const {
    llmConfigReady,
    remoteSpeechActive,
    languages: displayedLanguageOptions,
    language: displayedLanguage,
    languageGuidance,
    autoDictionarySupported,
    aiFeaturesReady,
    setLlmProvider,
    setLlmEndpoint,
    setLlmApiKey,
    setRemoteSpeechProvider,
    setRemoteSpeechEndpoint,
    setRemoteSpeechApiKey: setRemoteSpeechApiKeyRawAndClearModels,
    availableModels,
    fetchAvailableModels,
    availableSpeechModels,
    fetchAvailableSpeechModels,
  } = useSettingsProviderControls({
    enabled: isOpen,
    loading,
    licenseGateActive,
    draft: settingsDraft,
    modelCatalog,
    actions: providerActions,
    errorSourceTab: settingsErrors.issue?.sourceTab ?? null,
    clearError: settingsErrors.clear,
    showError: settingsErrors.showProvider,
  });

  const setLlmEnabled = useCallback(
    (value: boolean) => {
      setLlmEnabledRaw(value);
      if (!value) {
        setEditModeEnabled(false);
        clearSettingsErrorIfNoInvalidDrafts();
      }
    },
    [clearSettingsErrorIfNoInvalidDrafts],
  );

  const setTranscriptionMode = useCallback(
    (mode: TranscriptionMode) => {
      setTranscriptionModeRaw(mode);
      if (
        mode === "cloud" &&
        (activeTab === "models" || activeTab === "providers")
      ) {
        setActiveTab("general");
      }
    },
    [activeTab],
  );

  const shortcutEditor = useShortcutEditor({
    enabled: isOpen,
    aiFeaturesReady,
    persistence: shortcutPersistence,
    clearError: settingsErrors.clear,
    showError: settingsErrors.showShortcut,
    onClose,
  });
  const {
    snapshot: shortcutSnapshot,
    smartEnabled,
    setSmartEnabled,
    holdEnabled,
    setHoldEnabled,
    toggleEnabled,
    setToggleEnabled,
    shortcutBindings,
    invalidShortcutDrafts,
    captureActive,
    capturePreview,
    startCapture: handleStartCapture,
    updateBinding: updateShortcutBinding,
    addBinding: addShortcutBinding,
    removeBinding: removeShortcutBinding,
    hydrate: hydrateShortcuts,
    acceptSavedBindings,
    rejectDraft: rejectShortcutDraft,
    clearErrorIfValid,
  } = shortcutEditor;
  clearShortcutErrorRef.current = clearErrorIfValid;

  const hydrateFromSettings = useCallback(
    (settings: StoredSettings) => {
      hydrateSettingsDraft(settings);
      hydrateShortcuts(settings);
    },
    [hydrateSettingsDraft, hydrateShortcuts],
  );

  const buildSettingsArgs = useCallback(
    (overrides: SettingsSaveOverrides = {}) =>
      buildSettingsUpdateArgs(
        {
          draft: settingsDraft,
          shortcuts: shortcutSnapshot,
          modelCatalog,
          licenseGateActive,
          llmConfigReady,
          remoteSpeechActive,
          aiFeaturesReady,
          autoDictionarySupported,
        },
        overrides,
      ),
    [
      aiFeaturesReady,
      autoDictionarySupported,
      licenseGateActive,
      llmConfigReady,
      modelCatalog,
      remoteSpeechActive,
      settingsDraft,
      shortcutSnapshot,
    ],
  );

  const handleSettingsQueryError = useCallback(
    (queryError: unknown) => {
      console.error("Failed to load settings:", queryError);
      settingsErrors.show("Failed to load settings", "general");
    },
    [settingsErrors.show],
  );
  const handleSettingsSaved = useCallback(
    (
      args: ReturnType<typeof buildSettingsArgs>,
      overrides?: SettingsSaveOverrides,
    ) => {
      acceptSavedBindings(
        args.shortcutBindings,
        overrides?.shortcutDraftTarget,
      );
      clearSettingsErrorIfNoInvalidDrafts();
    },
    [acceptSavedBindings, clearSettingsErrorIfNoInvalidDrafts],
  );
  const handleSettingsSaveFailed = useCallback(
    (saveError: unknown, overrides?: SettingsSaveOverrides) => {
      const message = String(saveError);
      if (overrides?.shortcutDraftTarget) {
        rejectShortcutDraft(overrides.shortcutDraftTarget, message);
      }
      settingsErrors.show(message);
    },
    [rejectShortcutDraft, settingsErrors.show],
  );
  const {
    saveNow: saveSettingsNow,
    cancelScheduledSave: clearPendingSettingsSave,
    flushScheduledSave: flushPendingSettingsSave,
  } = useSettingsPersistence({
    enabled: isOpen,
    loading,
    canAutosave: captureActive === null,
    settings: resources.settings.data,
    settingsError: resources.settings.error,
    buildArgs: buildSettingsArgs,
    onHydrate: hydrateFromSettings,
    onSettingsError: handleSettingsQueryError,
    onSaved: handleSettingsSaved,
    onSaveFailed: handleSettingsSaveFailed,
  });
  shortcutPersistenceRef.current = {
    save: (overrides) => void saveSettingsNow(overrides),
    cancelScheduledSave: clearPendingSettingsSave,
    flushScheduledSave: flushPendingSettingsSave,
  };

  useEffect(() => {
    if (!aiFeaturesReady) setEditModeEnabled(false);
  }, [aiFeaturesReady, setEditModeEnabled]);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const localModels = useSettingsLocalModels({
    enabled: isOpen,
    catalog: modelCatalog,
    statusByModel: modelStatus,
    selectedModel: localModel,
    appLocale,
    language,
    remoteSpeechActive,
    setSelectedModel: setLocalModel,
    setLanguage,
    cancelScheduledSave: clearPendingSettingsSave,
    save: saveSettingsNow,
  });

  const appActions = useSettingsAppActions({
    dataDirectory: appInfo?.data_dir_path,
    setScreenContext: setUseScreenContextState,
    setTextSize: setTextSizeModeRaw,
    setTheme: setThemeModeRaw,
    setAutoLaunch: setAutoLaunchEnabledState,
    setStartInBackground,
    installCli: installCliAsync,
    removeCli: removeCliAsync,
    clearError: settingsErrors.clear,
    showError: settingsErrors.show,
  });

  const openFaq = useCallback(() => setShowFAQModal(true), []);
  const closeFaq = useCallback(() => setShowFAQModal(false), []);

  return {
    navigation: {
      activeTab,
      selectTab: setActiveTab,
      loading,
      error: settingsErrors.issue,
    },
    tabs: {
      general: {
        transcriptionMode,
        onTranscriptionModeChange: setTranscriptionMode,
        modelStatus,
        localModel,
        remoteSpeechEnabled,
        remoteSpeechProvider,
        remoteSpeechEndpoint,
        remoteSpeechModel,
        inputDevices,
        microphoneDevice,
        onMicrophoneDeviceChange: setMicrophoneDevice,
        language: displayedLanguage,
        onLanguageChange: setLanguage,
        languages: displayedLanguageOptions,
        languageGuidance,
        smartEnabled,
        setSmartEnabled,
        holdEnabled,
        setHoldEnabled,
        toggleEnabled,
        setToggleEnabled,
        shortcutBindings,
        invalidShortcutDrafts,
        captureActive,
        capturePreview,
        onStartCapture: handleStartCapture,
        updateShortcutBinding,
        addShortcutBinding,
        removeShortcutBinding,
        editModeEnabled,
        setEditModeEnabled,
        previewBeforeInsertEnabled,
        setPreviewBeforeInsertEnabled,
        previewBeforeInsertSelectionEnabled,
        setPreviewBeforeInsertSelectionEnabled,
        useScreenContext,
        setUseScreenContext: appActions.setUseScreenContext,
        autoDictionaryEnabled,
        autoDictionarySupported,
        setAutoDictionaryEnabled,
        aiFeaturesReady,
        licenseGateActive,
      },
      models: {
        modelCatalog,
        modelStatus,
        downloadState: localModels.downloadState,
        localModel,
        transcriptionMode,
        remoteSpeechEnabled,
        remoteSpeechProvider,
        remoteSpeechModel,
        setLocalModel: localModels.select,
        handleDownload: localModels.download,
        handleDelete: localModels.remove,
        handleCancelDownload: localModels.cancelDownload,
      },
      providers: {
        meeting: {
          provider: meetingAiProvider,
          setProvider: setMeetingAiProvider,
          model: localLlmModel,
          setModel: setLocalLlmModel,
        },
        speech: {
          enabled: remoteSpeechEnabled,
          setEnabled: setRemoteSpeechEnabled,
          provider: remoteSpeechProvider,
          setProvider: setRemoteSpeechProvider,
          endpoint: remoteSpeechEndpoint,
          setEndpoint: setRemoteSpeechEndpoint,
          apiKey: remoteSpeechApiKey,
          setApiKey: setRemoteSpeechApiKeyRawAndClearModels,
          model: remoteSpeechModel,
          setModel: setRemoteSpeechModel,
          availableModels: availableSpeechModels,
          fetchAvailableModels: fetchAvailableSpeechModels,
        },
        writing: {
          enabled: llmEnabled,
          setEnabled: setLlmEnabled,
          provider: llmProvider,
          setProvider: setLlmProvider,
          endpoint: llmEndpoint,
          setEndpoint: setLlmEndpoint,
          apiKey: llmApiKey,
          setApiKey: setLlmApiKey,
          model: llmModel,
          setModel: setLlmModel,
          availableModels,
          fetchAvailableModels,
        },
      },
      app: {
        micPermission,
        accessibilityPermission,
        inputMonitoringPermission,
        onRequestMicrophonePermission: handleRequestMicrophonePermission,
        textSizeMode,
        onTextSizeModeChange: appActions.setTextSizeMode,
        themeMode,
        onThemeModeChange: appActions.setThemeMode,
        appLocale,
        onAppLocaleChange: setAppLocale,
        mediaAction,
        onMediaActionChange: setMediaAction,
        autoUpdateEnabled,
        onAutoUpdateEnabledChange: setAutoUpdateEnabled,
        autoLaunchEnabled,
        onAutoLaunchEnabledChange: appActions.setAutoLaunchEnabled,
        startInBackground,
        onStartInBackgroundChange: setStartInBackground,
        calendarMeetingAwarenessEnabled,
        onCalendarMeetingAwarenessEnabledChange:
          setCalendarMeetingAwarenessEnabled,
        autoDeleteTarget,
        onAutoDeleteTargetChange: setAutoDeleteTarget,
        autoDeleteDuration,
        onAutoDeleteDurationChange: setAutoDeleteDuration,
        audioStorageBudgetMb,
        onAudioStorageBudgetMbChange: setAudioStorageBudgetMb,
        hideOverlaysFromCapture,
        onHideOverlaysFromCaptureChange: setHideOverlaysFromCapture,
        markdownMirrorEnabled,
        onMarkdownMirrorEnabledChange: setMarkdownMirrorEnabled,
        markdownMirrorPath,
        onMarkdownMirrorPathChange: setMarkdownMirrorPath,
        analyticsEnabled,
        onAnalyticsEnabledChange: setAnalyticsEnabled,
        platformCapabilities,
      },
      about: {
        appInfo,
        transcriptionMode,
        formatBytes: formatByteCount,
        cliInstallStatus,
        cliInstallBusy,
        activeLicense,
        onInstallCli: appActions.installCli,
        onRemoveCli: appActions.removeCli,
        onOpenDataDir: appActions.openDataDirectory,
        onExportArchive: appActions.exportArchive,
        archiveExportStatus: appActions.archiveStatus,
        onOpenFAQ: openFaq,
      },
    },
    faq: {
      isOpen: showFAQModal,
      close: closeFaq,
    },
  };
}
