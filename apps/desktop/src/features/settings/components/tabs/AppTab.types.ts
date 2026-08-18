import type { Variants } from "framer-motion";
import type { PlatformCapabilities } from "../../../../shared/lib/platform";
import type {
  AppLocaleSetting,
  AutoDeleteTarget,
  MediaAction,
  RecordingPrunePolicy,
  TextSizeMode,
  ThemeMode,
} from "../../../../types";

export type AppSection = "appearance" | "calendar" | "privacy" | "storage";

export type AppFrameProps = {
  activeSection?: AppSection;
  variants: Variants;
};

export type AppAppearanceProps = {
  activeSection?: AppSection;
  textSizeMode: TextSizeMode;
  onTextSizeModeChange: (mode: TextSizeMode) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  appLocale: AppLocaleSetting;
  onAppLocaleChange: (locale: AppLocaleSetting) => void;
};

export type AppPrivacyProps = {
  activeSection?: AppSection;
  micPermission: boolean | null;
  accessibilityPermission: boolean | null;
  inputMonitoringPermission: boolean | null;
  onRequestMicrophonePermission: () => Promise<void>;
  hideOverlaysFromCapture: boolean;
  onHideOverlaysFromCaptureChange: (enabled: boolean) => void;
  analyticsEnabled: boolean;
  onAnalyticsEnabledChange: (enabled: boolean) => void;
  platformCapabilities: PlatformCapabilities;
};

export type AppCalendarProps = {
  activeSection?: AppSection;
  calendarMeetingAwarenessEnabled: boolean;
  onCalendarMeetingAwarenessEnabledChange: (enabled: boolean) => void;
  platformCapabilities: PlatformCapabilities;
};

export type AppAutomationProps = {
  activeSection?: AppSection;
  textSizeMode: TextSizeMode;
  mediaAction: MediaAction;
  onMediaActionChange: (action: MediaAction) => void;
  autoUpdateEnabled: boolean;
  onAutoUpdateEnabledChange: (enabled: boolean) => void;
  autoLaunchEnabled: boolean;
  onAutoLaunchEnabledChange: (enabled: boolean) => void;
  startInBackground: boolean;
  onStartInBackgroundChange: (enabled: boolean) => void;
  autoDeleteTarget: AutoDeleteTarget;
  onAutoDeleteTargetChange: (target: AutoDeleteTarget) => void;
  autoDeleteDuration: RecordingPrunePolicy;
  onAutoDeleteDurationChange: (duration: RecordingPrunePolicy) => void;
  audioStorageBudgetMb: number;
  onAudioStorageBudgetMbChange: (budgetMb: number) => void;
  platformCapabilities: PlatformCapabilities;
};

export type AppArchiveProps = {
  activeSection?: AppSection;
  markdownMirrorEnabled: boolean;
  onMarkdownMirrorEnabledChange: (enabled: boolean) => void;
  markdownMirrorPath: string;
  onMarkdownMirrorPathChange: (path: string) => void;
};

export type AppTabProps = AppFrameProps &
  AppAppearanceProps &
  AppPrivacyProps &
  AppCalendarProps &
  AppAutomationProps &
  AppArchiveProps;
