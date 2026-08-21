import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AppInfo,
  StoredSettings,
  TextSizeMode,
  ThemeMode,
} from "../contracts";

export const getSettings = () => invoke<StoredSettings>("get_settings");

export const getAppInfo = () => invoke<AppInfo>("get_app_info");

export const updateSettings = <TArgs extends object>(args: TArgs) =>
  invoke<void>("update_settings", { args });

export const setShortcutCaptureActive = (active: boolean) =>
  invoke<void>("set_shortcut_capture_active", { active });

export const checkMicrophonePermission = () =>
  invoke<boolean>("check_microphone_permission");

export const requestMicrophonePermission = () =>
  invoke<void>("request_microphone_permission");

export const openMicrophoneSettings = () =>
  invoke<void>("open_microphone_settings");

export const checkAccessibilityPermission = () =>
  invoke<boolean>("check_accessibility_permission");

export const openAccessibilitySettings = () =>
  invoke<void>("open_accessibility_settings");

export const openInputMonitoringSettings = () =>
  invoke<void>("open_input_monitoring_settings");

export const requestScreenCapturePermission = () =>
  invoke<boolean>("request_screen_capture_permission");

export const openScreenCaptureSettings = () =>
  invoke<void>("open_screen_capture_settings");

export const openDataDirectory = (path: string) =>
  invoke<void>("open_data_dir", { path });

export const exportCompleteArchive = (path: string) =>
  invoke<void>("export_complete_archive", { path });

export const trackOnboardingStepViewed = (step: string) =>
  invoke<void>("track_onboarding_step_viewed", { step });

export const completeOnboarding = () => invoke<void>("complete_onboarding");

export const resetOnboarding = () => invoke<void>("reset_onboarding");

export const revealLogs = () => invoke<void>("reveal_logs");

export const subscribeSettingsChanged = (
  handler: (settings: StoredSettings) => void,
): Promise<UnlistenFn> =>
  listen<StoredSettings>("settings:changed", ({ payload }) => handler(payload));

export const subscribeTextSizeChanged = (
  handler: (mode: TextSizeMode | undefined) => void,
): Promise<UnlistenFn> =>
  listen<{ mode?: TextSizeMode }>("ui:text_size_changed", ({ payload }) =>
    handler(payload?.mode),
  );

export const subscribeThemeChanged = (
  handler: (mode: ThemeMode | undefined) => void,
): Promise<UnlistenFn> =>
  listen<{ mode?: ThemeMode }>("ui:theme_changed", ({ payload }) =>
    handler(payload?.mode),
  );

export const notifySettingsRendererReady = () =>
  emit("settings:renderer_ready");
