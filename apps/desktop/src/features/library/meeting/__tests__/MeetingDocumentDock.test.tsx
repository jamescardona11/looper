// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MeetingDocumentDock } from "../MeetingDocumentDock";

const { askState, mutate, useMeetingAiStatus } = vi.hoisted(() => ({
  askState: { isPending: false },
  mutate: vi.fn(),
  useMeetingAiStatus: vi.fn<
    () => { data: { state: string; actionableMessage?: string } }
  >(() => ({ data: { state: "ready" } })),
}));

vi.mock("../../queries", () => ({
  useAskMeeting: () => ({
    mutate,
    isPending: askState.isPending,
    error: null,
  }),
}));

vi.mock("../../../settings/models/local-llm-queries", () => ({
  useMeetingAiStatus,
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  askState.isPending = false;
  useMeetingAiStatus.mockReturnValue({ data: { state: "ready" } });
});

const renderDock = (overrides = {}) => {
  const props = {
    id: "meeting-1",
    audioReady: true,
    audioError: null,
    isPlaying: false,
    onTogglePlayback: vi.fn(),
    audioCurrentTime: 22,
    audioDuration: 60,
    scrubberPercent: 36,
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <MeetingDocumentDock {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
};

describe("MeetingDocumentDock", () => {
  test("keeps playback and Ask in the document instead of a global dock", () => {
    const { container, props } = renderDock();
    const dock = container.querySelector('[data-ui-dock="meeting-document"]');
    const sourceStatus = screen.getByRole("status");

    expect(dock?.className).not.toContain("absolute");
    expect(screen.getByText("Source retained").isConnected).toBe(true);
    expect(sourceStatus.getAttribute("data-state")).toBe("retained");
    expect(
      screen.getByText("Answers are generated from this recording.")
        .isConnected,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));

    expect(props.onTogglePlayback).toHaveBeenCalledTimes(1);
  });

  test("shows loading without claiming retention before audio is ready", () => {
    renderDock({ audioReady: false });

    expect(screen.getByText("Loading source…").isConnected).toBe(true);
    expect(screen.queryByText("Source retained")).toBeNull();
    expect(screen.getByRole("status").getAttribute("data-state")).toBe(
      "loading",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Play audio",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("shows unavailable when loading or playback has failed", () => {
    renderDock({
      audioReady: true,
      audioError: "Audio unavailable",
      isPlaying: true,
    });

    expect(screen.getByText("Source unavailable").isConnected).toBe(true);
    expect(screen.queryByText("Source retained")).toBeNull();
    expect(screen.getByRole("status").getAttribute("data-state")).toBe(
      "unavailable",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Pause audio",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("keeps a playing source retained during a readiness handoff", () => {
    renderDock({ audioReady: false, isPlaying: true });

    expect(screen.getByText("Source retained").isConnected).toBe(true);
    expect(screen.getByRole("status").getAttribute("data-state")).toBe(
      "retained",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Pause audio",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  test("submits a contextual question through the meeting API", () => {
    mutate.mockImplementation((_variables, options) => {
      options.onSuccess("The decision and owners are ready to share.");
    });
    renderDock();

    const input = screen.getByRole("textbox", { name: "Ask this note…" });
    fireEvent.change(input, { target: { value: "What did we decide?" } });

    fireEvent.click(screen.getByRole("button", { name: "Ask recording" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        id: "meeting-1",
        question: "What did we decide?",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(
      screen.getByText("The decision and owners are ready to share.")
        .isConnected,
    ).toBe(true);
    expect((input as HTMLInputElement).value).toBe("");
  });

  test("disables audio and Ask when their capabilities are unavailable", () => {
    useMeetingAiStatus.mockReturnValue({
      data: { state: "error", actionableMessage: "Download a local model" },
    });
    renderDock({ audioReady: false });

    expect(
      (
        screen.getByRole("button", {
          name: "Play audio",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Ask this note…",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByPlaceholderText("Meeting intelligence unavailable")
        .isConnected,
    ).toBe(true);
  });

  test("announces slow local inference while Ask is pending", () => {
    askState.isPending = true;
    renderDock();

    expect(
      screen.getByText("Thinking locally…").closest('[role="status"]')
        ?.textContent,
    ).toContain("Thinking locally…");
    expect(
      (
        screen.getByRole("button", {
          name: "Ask recording",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
