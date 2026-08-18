import { open } from "@tauri-apps/plugin-dialog";
import type React from "react";
import type {
  AppLocaleSetting,
  AutoDeleteTarget,
  MediaAction,
  RecordingPrunePolicy,
  TextSizeMode,
  ThemeMode,
} from "../../../../types";
import type { CalendarAccessStatus } from "../../../../data/meeting-awareness";
import type { AppTabProps } from "./AppTab.types";
import { useAppTabOptions, type SelectOption } from "./useAppTabOptions";
import { useCalendarAwarenessControls } from "./useCalendarAwarenessControls";
import { useMediaActionControl } from "./useMediaActionControl";
import {
  useRetentionControls,
  type PendingBudgetConfirmation,
  type PendingPruneConfirmation,
} from "./useRetentionControls";

type DuckScrubEvent =
  React.MouseEvent<HTMLSpanElement> | React.TouchEvent<HTMLSpanElement>;

export type AppTabControls = {
  appLanguageOptions: SelectOption<AppLocaleSetting>[];
  applyAudioBudgetChange: (nextBudgetMb: number) => Promise<void>;
  applyAutoDeleteChange: (
    nextTarget: AutoDeleteTarget,
    nextDuration: RecordingPrunePolicy,
  ) => Promise<void>;
  audioBudgetOptions: SelectOption<number>[];
  calendarAccess: CalendarAccessStatus;
  calendarBusy: boolean;
  chooseMarkdownMirrorFolder: () => Promise<void>;
  duckDescription: string;
  duckIndex: number;
  duckStops: SelectOption<MediaAction>[];
  handleCloseBudgetConfirmation: () => void;
  handleClosePruneConfirmation: () => void;
  handleConfirmBudgetChange: () => void;
  handleConfirmPruneChange: () => void;
  handleDuckChange: (index: number) => void;
  handleDuckScrubStart: (event: DuckScrubEvent) => void;
  hasPermissionRows: boolean;
  isPreviewingBudget: boolean;
  isPreviewingPrune: boolean;
  pendingBudgetConfirmation: PendingBudgetConfirmation | null;
  pendingPruneConfirmation: PendingPruneConfirmation | null;
  pruneConfirmationFootnote: string;
  pruneConfirmationMessage: string;
  pruneTargetOptions: SelectOption<AutoDeleteTarget>[];
  recordingPruneOptions: SelectOption<RecordingPrunePolicy>[];
  textSizeOptions: SelectOption<TextSizeMode>[];
  themeOptions: SelectOption<ThemeMode>[];
  toggleCalendarAwareness: () => Promise<void>;
};

export const inlineAutoDeleteDropdownProps = {
  className: "w-fit",
  buttonClassName:
    "!h-[22px] !w-auto !rounded-md !border-transparent !bg-transparent !px-0.5 !py-0 ui-text-label-strong focus:!border-transparent",
  valueClassName:
    "text-left underline underline-offset-[3px] decoration-content-muted transition-colors hover:decoration-content-primary",
  optionClassName: "!px-2 !py-1.5",
  optionLabelClassName: "whitespace-nowrap ui-text-meta font-medium",
  menuClassName: "!right-auto w-max min-w-full",
  truncate: false as const,
  fitButtonToWidestOption: false as const,
  hideChevron: true as const,
};

export function useAppTabControls(props: AppTabProps): AppTabControls {
  const options = useAppTabOptions();
  const media = useMediaActionControl(
    props.mediaAction,
    props.onMediaActionChange,
  );
  const calendar = useCalendarAwarenessControls({
    supported: props.platformCapabilities.id === "macos",
    enabled: props.calendarMeetingAwarenessEnabled,
    onEnabledChange: props.onCalendarMeetingAwarenessEnabledChange,
  });
  const retention = useRetentionControls({
    autoDeleteTarget: props.autoDeleteTarget,
    onAutoDeleteTargetChange: props.onAutoDeleteTargetChange,
    autoDeleteDuration: props.autoDeleteDuration,
    onAutoDeleteDurationChange: props.onAutoDeleteDurationChange,
    audioStorageBudgetMb: props.audioStorageBudgetMb,
    onAudioStorageBudgetMbChange: props.onAudioStorageBudgetMbChange,
    pruneOptions: options.prunePolicies,
  });

  const chooseMarkdownMirrorFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    props.onMarkdownMirrorPathChange(selected);
    props.onMarkdownMirrorEnabledChange(true);
  };

  const capabilities = props.platformCapabilities;
  return {
    appLanguageOptions: options.appLanguages,
    audioBudgetOptions: options.audioBudgets,
    calendarAccess: calendar.access,
    calendarBusy: calendar.busy,
    chooseMarkdownMirrorFolder,
    duckDescription: media.description,
    duckIndex: media.index,
    duckStops: media.stops,
    handleDuckChange: media.changeIndex,
    handleDuckScrubStart: media.startScrub,
    hasPermissionRows:
      capabilities.requiresNativeMicrophonePermission ||
      capabilities.requiresAccessibilityPermission ||
      capabilities.requiresInputMonitoringPermission,
    pruneTargetOptions: options.pruneTargets,
    recordingPruneOptions: options.prunePolicies,
    textSizeOptions: options.textSize,
    themeOptions: options.themes,
    toggleCalendarAwareness: calendar.toggle,
    ...retention,
  };
}
