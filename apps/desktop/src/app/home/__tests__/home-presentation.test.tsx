// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { HomePresentation } from "../home-presentation";
import { createHomeState, type HomeState } from "../home-state";
import { EMPTY_TODAY_DICTATION_STATS } from "../../../features/transcriptions/todayStats";

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
  default: () => <div data-testid="library-view" />,
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
vi.mock(
  "../../../features/transcriptions/components/TranscriptionList",
  () => ({
    default: () => <div data-testid="transcription-list" />,
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

afterEach(cleanup);

function renderHomePresentation(
  statePatch: Partial<HomeState> = {},
  licenseGateActive = true,
) {
  const dispatch = vi.fn();
  const state = { ...createHomeState(licenseGateActive), ...statePatch };
  const view = render(
    <I18nProvider i18n={i18n}>
      <HomePresentation
        appVersion="1.4.2"
        dispatch={dispatch}
        licenseGateActive={licenseGateActive}
        reduceMotion={false}
        runDiagnostics={vi.fn().mockResolvedValue([])}
        settingsShortcut="⌥Space"
        showCleanupButtons
        state={state}
        todayStats={EMPTY_TODAY_DICTATION_STATS}
        todayStatsFetched
        transcriptionMode="local"
        updateAvailable
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
      "flex h-screen w-screen overflow-hidden bg-transparent font-sans ui-color-on-solid select-none",
    );
    expect(shell?.firstElementChild?.getAttribute("data-testid")).toBe(
      "window-controls",
    );
    expect(sidebar?.className).toContain("w-[68px]");
    expect(sidebar?.className).toContain("backdrop-blur-2xl");
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
  });

  test("dispatches navigation, Memory, meeting and support actions", () => {
    const { dispatch } = renderHomePresentation({ supportMenuOpen: true });

    fireEvent.click(screen.getByRole("button", { name: "Meetings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Ask Memory/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open meeting" }));
    fireEvent.click(screen.getByRole("button", { name: /^FAQ/ }));
    fireEvent.click(screen.getByRole("button", { name: "Update available" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "activate-view",
      view: "library",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "ask-memory",
      query: null,
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

  test("disables licensed navigation without changing its DOM contract", () => {
    renderHomePresentation({}, false);
    const meetings = screen.getByRole("button", { name: "Meetings" });
    const memory = screen.getByRole("button", { name: "Memory" });
    const voice = screen.getByRole("button", { name: "Voice" });

    expect(meetings.hasAttribute("disabled")).toBe(true);
    expect(memory.hasAttribute("disabled")).toBe(true);
    expect(voice.hasAttribute("disabled")).toBe(true);
    expect(meetings.className).toContain("disabled:pointer-events-none");
    expect(
      screen
        .getByRole("button", { name: /^Ask Memory/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
