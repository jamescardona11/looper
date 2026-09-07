// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { HomePresentation } from "../home-presentation";
import { createHomeState, type HomeState } from "../home-state";
import { EMPTY_TODAY_DICTATION_STATS } from "../../../features/transcriptions/todayStats";
import { EMPTY_WEEKLY_DICTATION_ACTIVITY } from "../../../features/transcriptions/todayStats";
import type { TodayDictationStats } from "../../../contracts";

vi.mock("../../../features/settings/shell/SettingsRoute", () => ({
  default: ({
    isOpen,
    initialTab,
  }: {
    isOpen: boolean;
    initialTab: string;
  }) => (
    <div
      data-open={String(isOpen)}
      data-tab={initialTab}
      data-testid="settings"
    >
      {isOpen ? <div role="status">Saved automatically</div> : null}
    </div>
  ),
}));
vi.mock("../../../features/feature-lab/components/FeatureLabView", () => ({
  default: () => <div data-testid="feature-lab" />,
}));
vi.mock("../../../features/library/meeting/HomeMeetingActivity", () => ({
  HomeMeetingActivity: ({
    onOpen,
  }: {
    onOpen: (item: { id: string; name: string }) => void;
  }) => (
    <button onClick={() => onOpen({ id: "meeting-1", name: "Design sync" })}>
      Open meeting
    </button>
  ),
}));
vi.mock("../../../features/library/list/LibraryView", () => ({
  default: ({
    onDetailVisibilityChange,
  }: {
    onDetailVisibilityChange?: (visible: boolean) => void;
  }) => (
    <div data-testid="library-view">
      <button onClick={() => onDetailVisibilityChange?.(true)}>
        Open mocked detail
      </button>
    </div>
  ),
}));
vi.mock("../../../features/memory/components/MemoryView", () => ({
  default: () => <div data-testid="memory-view" />,
}));
vi.mock(
  "../../../features/transcriptions/components/CaptureStatusCard",
  () => ({
    default: () => <div data-testid="capture-status" />,
  }),
);
vi.mock("../../../features/transcriptions/components/HomeAskBar", () => ({
  default: ({ onAsk }: { onAsk: (query: string) => void }) => (
    <button onClick={() => onAsk("roadmap")}>Ask from composer</button>
  ),
}));
vi.mock("../../../features/transcriptions/components/HomeTodayHeader", () => ({
  default: () => <div data-testid="today-header" />,
}));
vi.mock("../../../features/transcriptions/components/InsightsView", () => ({
  default: () => <div data-testid="insights-view" />,
}));
vi.mock(
  "../../../features/transcriptions/components/TranscriptionList",
  () => ({
    default: ({
      onOpenShortcutSettings,
    }: {
      onOpenShortcutSettings?: () => void;
    }) => (
      <div data-testid="transcription-list">
        {onOpenShortcutSettings ? (
          <button onClick={onOpenShortcutSettings}>See the shortcut</button>
        ) : null}
      </div>
    ),
  }),
);
vi.mock("../../../features/voice/components/VoiceView", () => ({
  default: () => <div data-testid="voice-view" />,
}));
vi.mock("../../../shared/ui/FAQModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-open={String(isOpen)} data-testid="faq" />
  ),
}));
vi.mock("../../../shared/ui/LooperLogo", () => ({
  LooperLogo: () => <div data-testid="looper-logo" />,
}));
vi.mock("../../../shared/ui/WindowControls", () => ({
  default: () => <div data-testid="window-controls" />,
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const POPULATED_TODAY_STATS: TodayDictationStats = {
  count: 2,
  words: 40,
  audioSeconds: 60,
  longestWords: 22,
  longestAudioSeconds: 35,
  llmCleanedCount: 0,
};

afterEach(cleanup);

function renderHomePresentation(
  statePatch: Partial<HomeState> = {},
  licenseGateActive = true,
  todayStats: TodayDictationStats = EMPTY_TODAY_DICTATION_STATS,
  shortcutAvailable?: boolean,
) {
  const dispatch = vi.fn();
  const state = { ...createHomeState(licenseGateActive), ...statePatch };
  const view = render(
    <I18nProvider i18n={i18n}>
      <HomePresentation
        appVersion="1.4.2"
        dispatch={dispatch}
        hasHistory={todayStats.count > 0}
        reduceMotion={false}
        runDiagnostics={vi.fn().mockResolvedValue([])}
        shortcutAvailable={shortcutAvailable}
        settingsShortcut="⌥Space"
        showCleanupButtons
        state={state}
        todayStats={todayStats}
        transcriptionMode="local"
        updateAvailable
        weeklyActivity={
          todayStats.count > 0
            ? {
                days: EMPTY_WEEKLY_DICTATION_ACTIVITY.days.map(
                  (day, index) => ({
                    ...day,
                    height: index === 3 ? 100 : 0,
                    words: index === 3 ? todayStats.words : 0,
                  }),
                ),
                words: todayStats.words,
              }
            : EMPTY_WEEKLY_DICTATION_ACTIVITY
        }
      />
    </I18nProvider>,
  );
  return { ...view, dispatch };
}

describe("Home presentation contract", () => {
  test("keeps the shell hierarchy, sidebar classes and route stage", () => {
    const { container } = renderHomePresentation();
    const shell = container.firstElementChild;
    const sidebar = shell?.querySelector("aside[data-app-sidebar]");
    const workspace = shell?.querySelector("main");

    expect(shell?.className).toBe(
      "desktop-workspace-shell flex overflow-hidden bg-transparent font-sans text-content-primary select-none",
    );
    expect(shell?.firstElementChild?.getAttribute("data-testid")).toBe(
      "window-controls",
    );
    expect(sidebar?.className).toContain("w-[224px]");
    expect(sidebar?.className).toContain("desktop-workspace-sidebar");
    expect(workspace?.className).toContain("ui-canvas");
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBe(
      sidebar?.querySelector("nav"),
    );
    expect(screen.getByTestId("today-header").isConnected).toBe(true);
    expect(screen.getByTestId("settings").getAttribute("data-open")).toBe(
      "false",
    );
  });

  test("renders Settings as the active workspace route without a dialog", () => {
    renderHomePresentation({ activeView: "settings" });

    expect(screen.getByTestId("settings").getAttribute("data-open")).toBe(
      "true",
    );
    expect(
      screen.getAllByRole("status").map((node) => node.textContent),
    ).toContain("Saved automatically");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Setup" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("button", { name: "Dictation" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Return to Home" })).toBeNull();
  });

  test("marks Dictation as the only active primary route on Home", () => {
    renderHomePresentation();

    const dictation = screen.getByRole("button", { name: "Dictation" });
    expect(dictation.getAttribute("aria-current")).toBe("page");
    expect(dictation.querySelector("[data-nav-active-surface]")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Memory" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Memory" })
        .querySelector("[data-nav-active-surface]"),
    ).toBeNull();
  });

  test("marks Memory as the only active primary route on Memory", () => {
    renderHomePresentation({ activeView: "memory" });

    expect(
      screen
        .getByRole("button", { name: "Memory" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("button", { name: "Notes" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  test("moves the active rail state to Studio with its route", () => {
    renderHomePresentation({ activeView: "voice" });

    expect(
      screen
        .getByRole("button", { name: "Studio" })
        .getAttribute("data-active"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Dictation" })
        .getAttribute("data-active"),
    ).toBe("false");
  });

  test("removes the global Ask Memory action while a note detail owns the header", () => {
    renderHomePresentation({ activeView: "library" });

    expect(screen.getByRole("button", { name: /^Ask Memory/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open mocked detail" }));
    expect(screen.queryByRole("button", { name: /^Ask Memory/ })).toBeNull();
  });

  test("keeps first run focused and restores history tools when data exists", () => {
    const firstRun = renderHomePresentation();

    expect(screen.queryByRole("button", { name: /All history/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Ask from composer" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^Ask Memory/ })).toBeTruthy();

    firstRun.unmount();
    renderHomePresentation({}, true, POPULATED_TODAY_STATS);

    expect(screen.getByRole("button", { name: /All history/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ask from composer" }),
    ).toBeTruthy();
  });

  test("matches the global Ask Memory inset and renders grounded dictation context", () => {
    const { container } = renderHomePresentation(
      {},
      true,
      POPULATED_TODAY_STATS,
    );
    const askMemory = screen.getByRole("button", { name: /^Ask Memory/ });
    const header = askMemory.closest("header");

    expect(header?.className).toContain("px-7");
    expect(header?.hasAttribute("data-tauri-drag-region")).toBe(false);
    const titlebarDragRegion = header?.querySelector(
      ":scope > [data-tauri-drag-region]",
    );
    expect(titlebarDragRegion?.className).toContain("pointer-events-auto");
    expect(titlebarDragRegion?.className).toContain("h-9");
    expect(askMemory.closest("[data-tauri-drag-region]")).toBeNull();
    expect(askMemory.className).toContain("w-[112px]");
    expect(screen.getByText("On-device model selected")).toBeTruthy();
    expect(
      screen.getByText("Audio and transcript stay on this Mac."),
    ).toBeTruthy();
    expect(screen.getByText("Dictation history")).toBeTruthy();
    expect(container.textContent).not.toContain("Product sync");
  });

  test("does not claim the global shortcut is ready without Accessibility", () => {
    renderHomePresentation({}, true, POPULATED_TODAY_STATS, false);

    expect(screen.getByText(/⌥Space needs Accessibility/)).toBeTruthy();
    expect(screen.queryByText(/⌥Space ready/)).toBeNull();
  });

  test("dispatches navigation, Memory, meeting and support actions", () => {
    const { dispatch } = renderHomePresentation(
      { supportMenuOpen: true },
      true,
      POPULATED_TODAY_STATS,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    fireEvent.click(screen.getByRole("button", { name: /^Ask Memory/ }));
    fireEvent.click(screen.getByRole("button", { name: /All history/ }));
    fireEvent.click(screen.getByRole("button", { name: "See the shortcut" }));
    fireEvent.click(screen.getByRole("button", { name: /View model details/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Open meeting" }));
    fireEvent.click(screen.getByRole("button", { name: /^FAQ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Update available" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "activate-view",
      view: "library",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "activate-view",
      view: "insights",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "ask-memory",
      query: null,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "activate-view",
      view: "history",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "activate-view",
      view: "settings",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "open-meeting",
      item: { id: "meeting-1", query: "Design sync" },
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "open-faq" });
    expect(dispatch).toHaveBeenCalledWith({
      type: "open-settings",
      tab: "about",
    });
  });

  test("keeps workspace navigation available without a license", () => {
    renderHomePresentation({}, false);
    const meetings = screen.getByRole("button", { name: "Notes" });
    const memory = screen.getByRole("button", { name: "Memory" });
    const voice = screen.getByRole("button", { name: "Studio" });

    expect(meetings.hasAttribute("disabled")).toBe(false);
    expect(memory.hasAttribute("disabled")).toBe(false);
    expect(voice.hasAttribute("disabled")).toBe(false);
    expect(meetings.className).toContain("disabled:pointer-events-none");
    expect(
      screen
        .getByRole("button", { name: /^Ask Memory/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
});
