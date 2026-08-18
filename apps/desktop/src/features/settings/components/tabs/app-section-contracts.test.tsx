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
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const nativePermission = vi.hoisted(() => ({
  accessibility: vi.fn(),
  inputMonitoring: vi.fn(),
  inputMonitoringStatus: vi.fn(),
  openAccessibility: vi.fn(),
  openInputMonitoring: vi.fn(),
}));

vi.mock("../../../../shared/lib/macosPermissions", () => ({
  requestMacAccessibilityPermission: nativePermission.accessibility,
  requestMacInputMonitoringPermission: nativePermission.inputMonitoring,
  checkMacInputMonitoringPermission: nativePermission.inputMonitoringStatus,
}));

vi.mock("../../../../data/settings", () => ({
  openAccessibilitySettings: nativePermission.openAccessibility,
  openInputMonitoringSettings: nativePermission.openInputMonitoring,
}));

import { AppAutomationSection } from "./AppAutomationSection";
import { AppPrivacySection } from "./AppPrivacySection";
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

function controls(overrides: Partial<AppTabControls> = {}): AppTabControls {
  return {
    appLanguageOptions: [],
    applyAudioBudgetChange: vi.fn(),
    applyAutoDeleteChange: vi.fn(),
    audioBudgetOptions: [
      { value: 1024, label: "1 GB" },
      { value: 2048, label: "2 GB" },
    ],
    calendarAccess: "authorized",
    calendarBusy: false,
    chooseMarkdownMirrorFolder: vi.fn(),
    duckDescription: "Lowers system volume while recording.",
    duckIndex: 0,
    duckStops: [
      { value: "off", label: "Off" },
      { value: "duck25", label: "25%" },
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
    recordingPruneOptions: [
      { value: "never", label: "Never" },
      { value: "month", label: "Month" },
    ],
    textSizeOptions: [],
    themeOptions: [],
    toggleCalendarAwareness: vi.fn(),
    ...overrides,
  };
}

function privacyProps(
  overrides: Partial<ComponentProps<typeof AppPrivacySection>> = {},
): ComponentProps<typeof AppPrivacySection> {
  return {
    controls: controls(),
    micPermission: false,
    accessibilityPermission: false,
    inputMonitoringPermission: false,
    onRequestMicrophonePermission: vi.fn(),
    hideOverlaysFromCapture: false,
    onHideOverlaysFromCaptureChange: vi.fn(),
    analyticsEnabled: true,
    onAnalyticsEnabledChange: vi.fn(),
    platformCapabilities: capabilities,
    ...overrides,
  };
}

function automationProps(
  overrides: Partial<ComponentProps<typeof AppAutomationSection>> = {},
): ComponentProps<typeof AppAutomationSection> {
  return {
    controls: controls(),
    textSizeMode: "default",
    mediaAction: "off",
    onMediaActionChange: vi.fn(),
    autoUpdateEnabled: true,
    onAutoUpdateEnabledChange: vi.fn(),
    autoLaunchEnabled: true,
    onAutoLaunchEnabledChange: vi.fn(),
    startInBackground: false,
    onStartInBackgroundChange: vi.fn(),
    autoDeleteTarget: "audio",
    onAutoDeleteTargetChange: vi.fn(),
    autoDeleteDuration: "never",
    onAutoDeleteDurationChange: vi.fn(),
    audioStorageBudgetMb: 1024,
    onAudioStorageBudgetMbChange: vi.fn(),
    platformCapabilities: capabilities,
    ...overrides,
  };
}

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App privacy presentation contract", () => {
  test("keeps the section mounted but hidden and omits native rows when unsupported", () => {
    const platformCapabilities = {
      ...capabilities,
      requiresNativeMicrophonePermission: false,
      requiresAccessibilityPermission: false,
      requiresInputMonitoringPermission: false,
    };
    const view = renderWithI18n(
      <AppPrivacySection
        {...privacyProps({
          activeSection: "storage",
          controls: controls({ hasPermissionRows: false }),
          platformCapabilities,
        })}
      />,
    );

    const section = view.container.querySelector(
      '[data-settings-section="privacy"]',
    );
    expect(section?.className).toBe("hidden");
    expect(screen.queryByRole("button", { name: "Open Settings" })).toBeNull();
    expect(
      screen.queryByText("Permission changes may require a restart."),
    ).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  test("opens the native settings fallback when permission remains denied", async () => {
    nativePermission.accessibility.mockResolvedValue(false);
    nativePermission.inputMonitoring.mockResolvedValue(undefined);
    nativePermission.inputMonitoringStatus.mockResolvedValue(false);
    renderWithI18n(<AppPrivacySection {...privacyProps()} />);

    const settingsButtons = screen.getAllByRole("button", {
      name: "Open Settings",
    });
    fireEvent.click(settingsButtons[1]);
    fireEvent.click(settingsButtons[2]);

    await waitFor(() => {
      expect(nativePermission.openAccessibility).toHaveBeenCalledOnce();
      expect(nativePermission.openInputMonitoring).toHaveBeenCalledOnce();
    });
  });
});

describe("App automation presentation contract", () => {
  test("preserves media boundaries and the dependent login switch", () => {
    const setBackground = vi.fn();
    const view = renderWithI18n(
      <AppAutomationSection
        {...automationProps({
          autoLaunchEnabled: false,
          onStartInBackgroundChange: setBackground,
        })}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Previous media action" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Next media action" })
        .hasAttribute("disabled"),
    ).toBe(false);
    const dependentSwitch = screen.getByRole("switch", {
      name: "Toggle start in background",
    });
    expect(dependentSwitch.hasAttribute("disabled")).toBe(true);
    fireEvent.click(dependentSwitch);
    expect(setBackground).not.toHaveBeenCalled();
    expect(
      view.container.querySelector('[data-settings-section="storage"]')
        ?.className,
    ).toBe("flex flex-col space-y-2");
  });

  test("routes retention selections through the preview controls", () => {
    const applyRetention = vi.fn().mockResolvedValue(undefined);
    const applyBudget = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <AppAutomationSection
        {...automationProps({
          controls: controls({
            applyAutoDeleteChange: applyRetention,
            applyAudioBudgetChange: applyBudget,
          }),
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    fireEvent.click(screen.getByRole("option", { name: "Transcripts" }));
    fireEvent.click(screen.getByRole("button", { name: "Never" }));
    fireEvent.click(screen.getByRole("option", { name: "Month" }));
    fireEvent.click(screen.getByRole("button", { name: "1 GB" }));
    fireEvent.click(screen.getByRole("option", { name: "2 GB" }));

    expect(applyRetention).toHaveBeenNthCalledWith(1, "transcripts", "never");
    expect(applyRetention).toHaveBeenNthCalledWith(2, "audio", "month");
    expect(applyBudget).toHaveBeenCalledWith(2048);
  });
});

test("keeps distinctive Lingui ids and the settings surface hierarchy", () => {
  const translated = setupI18n();
  translated.loadAndActivate({
    locale: "es",
    messages: {
      "settings.app.privacy_permissions": "Privacidad verificada",
      "settings.app.hide_overlays_from_capture": "Captura verificada",
      "settings.app.automation": "Automatización verificada",
      "settings.app.audio_budget": "Presupuesto verificado",
    },
  });
  const view = render(
    <I18nProvider i18n={translated}>
      <AppPrivacySection {...privacyProps()} />
      <AppAutomationSection {...automationProps()} />
    </I18nProvider>,
  );

  expect(screen.getByText("Privacidad verificada").isConnected).toBe(true);
  expect(screen.getByText("Captura verificada").isConnected).toBe(true);
  expect(screen.getByText("Automatización verificada").isConnected).toBe(true);
  expect(screen.getByText("Presupuesto verificado").isConnected).toBe(true);

  const privacy = view.container.querySelector(
    '[data-settings-section="privacy"]',
  );
  const automation = view.container.querySelector(
    '[data-settings-section="storage"]',
  );
  expect(privacy?.children[1]?.className).toBe(
    "space-y-3 rounded-lg bg-surface-surface p-2.5",
  );
  expect(privacy?.children[2]?.className).toBe(
    "rounded-lg bg-surface-surface p-2.5",
  );
  expect(automation?.children[1]?.className).toBe(
    "flex-1 space-y-6 rounded-lg bg-surface-surface p-2.5",
  );
});
