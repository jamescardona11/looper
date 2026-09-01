import type { Variants } from "framer-motion";
import type { useSettingsForm } from "../preferences/useSettingsForm";

export type AppSection = "appearance" | "calendar" | "privacy" | "storage";

type AppForm = ReturnType<typeof useSettingsForm>["tabs"]["app"];
type Scoped = { activeSection?: AppSection };
type SectionProps<Keys extends keyof AppForm> = Scoped & Pick<AppForm, Keys>;

export type AppFrameProps = Scoped & { variants: Variants };

export type AppAppearanceProps = SectionProps<
  | "textSizeMode"
  | "onTextSizeModeChange"
  | "themeMode"
  | "onThemeModeChange"
  | "appLocale"
  | "onAppLocaleChange"
>;

export type AppPrivacyProps = SectionProps<
  | "micPermission"
  | "accessibilityPermission"
  | "inputMonitoringPermission"
  | "onRequestMicrophonePermission"
  | "hideOverlaysFromCapture"
  | "onHideOverlaysFromCaptureChange"
  | "analyticsEnabled"
  | "onAnalyticsEnabledChange"
  | "platformCapabilities"
>;

export type AppCalendarProps = SectionProps<
  | "calendarMeetingAwarenessEnabled"
  | "onCalendarMeetingAwarenessEnabledChange"
  | "microphoneMeetingAwarenessEnabled"
  | "onMicrophoneMeetingAwarenessEnabledChange"
  | "platformCapabilities"
>;

export type AppAutomationProps = SectionProps<
  | "textSizeMode"
  | "mediaAction"
  | "onMediaActionChange"
  | "autoUpdateEnabled"
  | "onAutoUpdateEnabledChange"
  | "autoLaunchEnabled"
  | "onAutoLaunchEnabledChange"
  | "startInBackground"
  | "onStartInBackgroundChange"
  | "autoDeleteTarget"
  | "onAutoDeleteTargetChange"
  | "autoDeleteDuration"
  | "onAutoDeleteDurationChange"
  | "audioStorageBudgetMb"
  | "onAudioStorageBudgetMbChange"
  | "platformCapabilities"
>;

export type AppArchiveProps = SectionProps<
  | "markdownMirrorEnabled"
  | "onMarkdownMirrorEnabledChange"
  | "markdownMirrorPath"
  | "onMarkdownMirrorPathChange"
>;

export type AppTabProps = AppFrameProps & AppForm;
