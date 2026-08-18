// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const platformMocks = vi.hoisted(() => ({
  requestAccessibility: vi.fn(),
  requestInputMonitoring: vi.fn(),
  checkInputMonitoring: vi.fn(),
  openAccessibility: vi.fn(),
  openInputMonitoring: vi.fn(),
}));

vi.mock("../../../../shared/lib/macosPermissions", () => ({
  requestMacAccessibilityPermission: platformMocks.requestAccessibility,
  requestMacInputMonitoringPermission: platformMocks.requestInputMonitoring,
  checkMacInputMonitoringPermission: platformMocks.checkInputMonitoring,
}));
vi.mock("../../../../data/settings", () => ({
  openAccessibilitySettings: platformMocks.openAccessibility,
  openInputMonitoringSettings: platformMocks.openInputMonitoring,
}));
vi.mock("../../../library/components/WatchFoldersSetting", () => ({
  default: () => <div>Watch folder controls</div>,
}));

import { AppAutomationSection } from "./AppAutomationSection";
import { AppConfirmationDialogs } from "./AppConfirmationDialogs";
import { AppPrivacySection } from "./AppPrivacySection";
import { AppStorageSection } from "./AppStorageSection";
import type { AppTabControls } from "./useAppTabControls";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const capabilities = {
  id: "macos" as const,
  requiresNativeMicrophonePermission: true,
  requiresAccessibilityPermission: true,
  requiresInputMonitoringPermission: true,
  supportsAutoPauseMedia: true,
  usesCustomWindowControls: true,
};

const controlSet = (
  overrides: Partial<AppTabControls> = {},
): AppTabControls => ({
  appLanguageOptions: [],
  applyAudioBudgetChange: vi.fn(),
  applyAutoDeleteChange: vi.fn(),
  audioBudgetOptions: [{ value: 1024, label: "1 GB" }],
  calendarAccess: "authorized",
  calendarBusy: false,
  chooseMarkdownMirrorFolder: vi.fn(),
  duckDescription: "Lowers system volume while recording.",
  duckIndex: 2,
  duckStops: [
    { value: "off", label: "Off" },
    { value: "duck10", label: "10%" },
    { value: "duck25", label: "25%" },
    { value: "duck50", label: "50%" },
    { value: "duck75", label: "75%" },
    { value: "pause", label: "Pause" },
  ],
  handleCloseBudgetConfirmation: vi.fn(),
  handleClosePruneConfirmation: vi.fn(),
  handleConfirmBudgetChange: vi.fn(),
  handleConfirmPruneChange: vi.fn(),
  handleDuckChange: vi.fn(),
  handleDuckScrubStart: vi.fn(),
  hasPermissionRows: true,
  isPreviewingBudget: false,
  isPreviewingPrune: false,
  pendingBudgetConfirmation: null,
  pendingPruneConfirmation: null,
  pruneConfirmationFootnote: "Audio only",
  pruneConfirmationMessage: "Two files will be deleted",
  pruneTargetOptions: [
    { value: "audio", label: "Audio" },
    { value: "transcripts", label: "Transcripts" },
  ],
  recordingPruneOptions: [{ value: "never", label: "Never" }],
  textSizeOptions: [],
  themeOptions: [],
  toggleCalendarAwareness: vi.fn(),
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app settings sections", () => {
  test("connects native permission and privacy actions", async () => {
    platformMocks.requestAccessibility.mockResolvedValue(true);
    platformMocks.checkInputMonitoring.mockResolvedValue(true);
    const requestMicrophone = vi.fn().mockResolvedValue(undefined);
    const setCaptureProtection = vi.fn();
    const setAnalytics = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <AppPrivacySection
          controls={controlSet()}
          micPermission={false}
          accessibilityPermission={false}
          inputMonitoringPermission={false}
          onRequestMicrophonePermission={requestMicrophone}
          hideOverlaysFromCapture={false}
          onHideOverlaysFromCaptureChange={setCaptureProtection}
          analyticsEnabled
          onAnalyticsEnabledChange={setAnalytics}
          platformCapabilities={capabilities}
        />
      </I18nProvider>,
    );

    const openSettings = screen.getAllByRole("button", {
      name: "Open Settings",
    });
    fireEvent.click(openSettings[0]);
    fireEvent.click(openSettings[1]);
    fireEvent.click(openSettings[2]);
    fireEvent.click(
      screen.getByRole("switch", {
        name: "Toggle overlay capture protection",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle usage analytics" }),
    );

    await waitFor(() => expect(requestMicrophone).toHaveBeenCalledOnce());
    expect(platformMocks.requestAccessibility).toHaveBeenCalledOnce();
    expect(platformMocks.requestInputMonitoring).toHaveBeenCalledOnce();
    expect(setCaptureProtection).toHaveBeenCalledWith(true);
    expect(setAnalytics).toHaveBeenCalledWith(false);
  });

  test("connects media, update and login controls", () => {
    const controls = controlSet();
    const setUpdate = vi.fn();
    const setLaunch = vi.fn();
    const setBackground = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <AppAutomationSection
          controls={controls}
          textSizeMode="default"
          mediaAction="duck25"
          onMediaActionChange={vi.fn()}
          autoUpdateEnabled
          onAutoUpdateEnabledChange={setUpdate}
          autoLaunchEnabled
          onAutoLaunchEnabledChange={setLaunch}
          startInBackground={false}
          onStartInBackgroundChange={setBackground}
          autoDeleteTarget="audio"
          onAutoDeleteTargetChange={vi.fn()}
          autoDeleteDuration="never"
          onAutoDeleteDurationChange={vi.fn()}
          audioStorageBudgetMb={1024}
          onAudioStorageBudgetMbChange={vi.fn()}
          platformCapabilities={capabilities}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Previous media action" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next media action" }));
    fireEvent.click(screen.getByRole("switch", { name: "Toggle auto-update" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle launch at login" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle start in background" }),
    );

    expect(controls.handleDuckChange).toHaveBeenNthCalledWith(1, 1);
    expect(controls.handleDuckChange).toHaveBeenNthCalledWith(2, 3);
    expect(setUpdate).toHaveBeenCalledWith(false);
    expect(setLaunch).toHaveBeenCalledWith(false);
    expect(setBackground).toHaveBeenCalledWith(true);
  });

  test("connects archive folder selection and destructive confirmations", () => {
    const chooseFolder = vi.fn();
    const confirmPrune = vi.fn();
    const controls = controlSet({
      chooseMarkdownMirrorFolder: chooseFolder,
      pendingPruneConfirmation: {
        target: "audio",
        duration: "week",
        candidateCount: 2,
      },
      handleConfirmPruneChange: confirmPrune,
    });
    render(
      <I18nProvider i18n={i18n}>
        <AppStorageSection
          controls={controls}
          markdownMirrorEnabled={false}
          onMarkdownMirrorEnabledChange={vi.fn()}
          markdownMirrorPath=""
          onMarkdownMirrorPathChange={vi.fn()}
        />
        <AppConfirmationDialogs controls={controls} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply anyway" }));
    expect(chooseFolder).toHaveBeenCalledOnce();
    expect(confirmPrune).toHaveBeenCalledOnce();
    expect(screen.getByText("Watch folder controls")).toBeTruthy();
  });
});
