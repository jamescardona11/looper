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

vi.mock("../../../settings/local-llm-queries", () => ({
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
    transcriptOpen: false,
    onTranscriptToggle: vi.fn(),
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
  test("keeps playback, Ask, and transcript controls in one bottom dock", () => {
    const { container, props } = renderDock();
    const dock = container.querySelector('[data-ui-dock="meeting-document"]');

    expect(dock?.className).toContain("absolute");
    expect(dock?.className).toContain("bottom-0");

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Transcript" }));

    expect(props.onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(props.onTranscriptToggle).toHaveBeenCalledTimes(1);
  });

  test("prefills a follow-up and submits it through the meeting API", () => {
    mutate.mockImplementation((_variables, options) => {
      options.onSuccess("The decision and owners are ready to share.");
    });
    renderDock();

    fireEvent.click(screen.getByRole("button", { name: "Draft follow-up" }));
    const input = screen.getByRole("textbox", { name: "Ask this recording…" });
    expect((input as HTMLInputElement).value).toBe(
      "Draft a concise follow-up with the decision and owners",
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask recording" }));

    expect(mutate).toHaveBeenCalledWith(
      {
        id: "meeting-1",
        question: "Draft a concise follow-up with the decision and owners",
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
          name: "Ask this recording…",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByPlaceholderText("Download a local model").isConnected,
    ).toBe(true);
  });

  test("announces slow local inference while Ask is pending", () => {
    askState.isPending = true;
    renderDock();

    expect(screen.getByRole("status").textContent).toContain(
      "Thinking locally…",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Ask recording",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
