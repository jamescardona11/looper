// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { MeetingCaptureState } from "../../../../contracts";
import MeetingCaptureOverlay from "../MeetingCaptureOverlay";
import { groupMeetingTranscriptSegments } from "../meeting-transcript";
import {
  nextDurationMilestone,
  remainingHoldStepMs,
  selectedDurationMs,
} from "../meeting-note-duration";

const stopMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const askMeetingMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));
const llmSettings = vi.hoisted(() => ({
  llm_enabled: true,
  llm_provider: "openrouter",
  llm_endpoint: "https://openrouter.ai/api/v1",
  llm_model: "openai/gpt-5.4-mini",
}));
const meetingDrag = vi.hoisted(() => vi.fn(async () => undefined));
const shortcutPermission = vi.hoisted(() => ({
  allowed: true,
  check: vi.fn(async () => shortcutPermission.allowed),
  retry: vi.fn(async () => undefined),
  open: vi.fn(async () => undefined),
  help: vi.fn(async () => undefined),
}));
const overlayPresentation = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      placement: "above" as const,
      sideAlignment: "bottom" as const,
    }),
  ),
);
const meetingDetails = vi.hoisted(() => ({
  live_transcript: [
    {
      id: "segment-1",
      source: "them" as const,
      text: "We should ship the transcript first.",
      start_ms: 0,
      end_ms: 1_000,
    },
    {
      id: "segment-2",
      source: "them" as const,
      text: "Then validate reconnect behavior.",
      start_ms: 1_000,
      end_ms: 2_000,
    },
    {
      id: "segment-3",
      source: "you" as const,
      text: "I will own the QA pass.",
      start_ms: 2_000,
      end_ms: 3_000,
    },
  ],
}));

vi.mock("../../queries", () => ({
  useStopMeetingCapture: () => stopMutation,
  useMeetingDetails: () => ({ data: meetingDetails }),
  useAskMeeting: () => askMeetingMutation,
}));

vi.mock("../../../settings/preferences/queries", () => ({
  useSettings: (select: (settings: typeof llmSettings) => unknown) => ({
    data: select(llmSettings),
  }),
}));

vi.mock("../../../settings/models/local-llm-queries", () => ({
  useMeetingAiStatus: () => ({
    data: {
      provider: "writing",
      model: llmSettings.llm_model,
      state:
        llmSettings.llm_enabled &&
        llmSettings.llm_provider !== "none" &&
        llmSettings.llm_endpoint &&
        llmSettings.llm_model
          ? "ready"
          : "runtime_error",
      actionableMessage: "Configure meeting intelligence.",
    },
  }),
}));

vi.mock("../../../../data/capture/overlay", () => ({
  setMeetingOverlayPresentation: overlayPresentation,
}));

vi.mock("../../../../data/capture/dictation", () => ({
  beginOverlayDrag: meetingDrag,
}));

vi.mock("../../../../data/capture/shortcuts", () => ({
  checkShortcutPermission: shortcutPermission.check,
  retryShortcuts: shortcutPermission.retry,
  openShortcutPermissionSettings: shortcutPermission.open,
  openShortcutPermissionHelp: shortcutPermission.help,
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "meeting.capture.active": "Meeting recording",
    "meeting.capture.drag": "Drag to move",
    "meeting.capture.note_saved": "Moment saved",
    "meeting.capture.note": "Marking moment",
    "meeting.capture.note.marking_hint": "hold Fn extends · release to save",
    "meeting.capture.note.release_current": "Release",
    "meeting.capture.note.more": "more",
    "meeting.capture.note.release_max": "Release to save · 60 s maximum",
    "meeting.capture.note.saved_hint": "The full meeting keeps recording",
    "meeting.capture.note.hold_hint": "Hold Fn: past · Double Fn: next",
    "meeting.capture.important_moment": "Important moment",
    "meeting.capture.important_moment.stop_hint":
      "Press Fn to save this moment",
    "meeting.capture.important_moment_saved": "Important moment saved",
    "meeting.capture.important_moment.saved_hint":
      "Saved and searchable after transcription",
    "meeting.capture.saving": "Saving...",
    "meeting.capture.stop": "Stop",
    "meeting.capture.transcript.toggle": "Show or hide transcript",
    "meeting.capture.rail_title": "Recording",
    "meeting.capture.sources": "You + Them",
    "note.capture.active": "Note recording",
    "note.capture.rail_title": "Note",
    "note.capture.source": "Microphone",
    "meeting.capture.shortcut_unavailable": "Fn blocked",
    "meeting.capture.shortcut_enable_hint": "Accessibility needed",
    "meeting.capture.shortcut_enable": "Why?",
    "meeting.capture.note.release_max_compact": "Release to save",
    "meeting.capture.note.saved_compact": "still recording",
    "meeting.capture.important_moment.saved_compact":
      "Searchable after transcription",
  },
});

const recordingState = (
  overrides: Partial<MeetingCaptureState> = {},
): MeetingCaptureState => ({
  phase: "recording",
  id: "meeting-1",
  started_at: "2026-07-18T10:00:00Z",
  elapsed_seconds: 84,
  system_audio_enabled: true,
  capture_intent: "meeting",
  warning: null,
  error: null,
  last_note_marker: null,
  active_note_selection: null,
  active_important_moment: null,
  live_transcript: "",
  capture_health: {
    status: "healthy",
    audio_lag_ms: 0,
  },
  ...overrides,
});

const renderOverlay = (state: MeetingCaptureState) =>
  render(
    <I18nProvider i18n={i18n}>
      <MeetingCaptureOverlay state={state} />
    </I18nProvider>,
  );

const settlePresentation = () => act(async () => Promise.resolve());

const expandOverlay = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: "Expand recording pill" }),
  );
  await settlePresentation();
};

afterEach(() => {
  cleanup();
  stopMutation.mutate.mockReset();
  stopMutation.isPending = false;
  askMeetingMutation.mutate.mockReset();
  askMeetingMutation.reset.mockReset();
  askMeetingMutation.isPending = false;
  askMeetingMutation.error = null;
  llmSettings.llm_enabled = true;
  llmSettings.llm_provider = "openrouter";
  llmSettings.llm_endpoint = "https://openrouter.ai/api/v1";
  llmSettings.llm_model = "openai/gpt-5.4-mini";
  overlayPresentation.mockClear();
  meetingDrag.mockClear();
  shortcutPermission.allowed = true;
  shortcutPermission.check.mockClear();
  shortcutPermission.retry.mockClear();
  shortcutPermission.open.mockClear();
  shortcutPermission.help.mockClear();
  meetingDetails.live_transcript.splice(3);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("MeetingCaptureOverlay", () => {
  test("expands the compact capsule directly into the transcript workspace", async () => {
    renderOverlay(recordingState());

    const expandButton = screen.getByRole("button", {
      name: "Expand recording pill",
    });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(expandButton.getAttribute("aria-controls")).toBe(
      "meeting-live-transcript",
    );
    expect(screen.queryByText("Recording")).toBeNull();

    await expandOverlay();

    expect(screen.getByLabelText("Live transcript").id).toBe(
      "meeting-live-transcript",
    );
    expect(
      screen
        .getByRole("button", { name: "Collapse recording pill" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(overlayPresentation).toHaveBeenLastCalledWith({
      compact: false,
      transcriptVisible: true,
      transcriptPinned: true,
    });
  });

  test("keeps compact recording identity when Accessibility is missing", async () => {
    shortcutPermission.allowed = false;
    renderOverlay(recordingState());

    await act(async () => {
      await Promise.resolve();
    });

    const pill = screen.getByLabelText("Meeting recording");
    expect(pill.textContent).toContain("1:24");
    expect(pill.textContent).not.toContain("Fn blocked");
    expect(pill.textContent).not.toContain("Accessibility needed");
    expect(pill.className).toContain("!w-[128px]");
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();

    await expandOverlay();
    expect(screen.getByText("Fn blocked")).toBeTruthy();
    expect(screen.getByLabelText("Meeting recording").className).toContain(
      "!w-[260px]",
    );

    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(shortcutPermission.help).toHaveBeenCalledTimes(1);
    expect(shortcutPermission.retry).not.toHaveBeenCalled();
  });

  test("collapses and restores despite missing Accessibility", async () => {
    shortcutPermission.allowed = false;
    renderOverlay(recordingState());

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Fn blocked")).toBeNull();
    expect(screen.getByText("1:24")).toBeTruthy();

    const compactPill = screen.getByLabelText("Meeting recording");
    expect(compactPill.className).toContain("!h-[36px]");
    expect(compactPill.className).toContain("!w-[128px]");
    expect(compactPill.className).toContain("!transition-colors");
    expect(
      screen.getByRole("button", { name: "Expand recording pill" }).className,
    ).toContain("h-9 w-10");
    await expandOverlay();
    expect(screen.getByText("Fn blocked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Why?" })).toBeTruthy();
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse recording pill" }),
    );
    expect(overlayPresentation).toHaveBeenLastCalledWith({
      compact: true,
      transcriptVisible: false,
      transcriptPinned: false,
    });
  });

  test("re-registers Fn after Accessibility becomes available", async () => {
    vi.useFakeTimers();
    shortcutPermission.allowed = false;
    renderOverlay(recordingState());

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("Fn blocked")).toBeNull();
    await expandOverlay();
    expect(screen.getByText("Fn blocked")).toBeTruthy();

    shortcutPermission.allowed = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(shortcutPermission.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Fn blocked")).toBeNull();
    expect(screen.getByText("1:24")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(shortcutPermission.check).toHaveBeenCalledTimes(2);
  });

  test("keeps the Accessibility warning visible while Fn remains blocked", async () => {
    vi.useFakeTimers();
    shortcutPermission.allowed = false;
    renderOverlay(recordingState());

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(screen.queryByText("Fn blocked")).toBeNull();
    await expandOverlay();
    expect(screen.getByText("Fn blocked")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Why?" })).toBeTruthy();
  });

  test("does not poll again when Accessibility is already available", async () => {
    vi.useFakeTimers();
    renderOverlay(recordingState());

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(shortcutPermission.check).toHaveBeenCalledTimes(1);
    expect(shortcutPermission.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Fn blocked")).toBeNull();
  });

  test("shows recording state and stops from the same draggable pill", async () => {
    renderOverlay(recordingState());
    await expandOverlay();

    expect(
      screen.getByText("Recording").hasAttribute("data-tauri-drag-region"),
    ).toBe(false);
    expect(screen.queryByText("1:24 · You + Them")).toBeNull();
    expect(screen.queryByText("You + Them")).toBeNull();
    // El estado completo no depende del hover: identidad, tiempo y acciones
    // se leen juntos desde que aparece la reunión.
    expect(screen.getByText("1:24")).toBeTruthy();
    const railInfo = screen.getByText("Recording").parentElement;
    expect(railInfo?.className).toContain("opacity-100");
    expect(railInfo?.className).not.toContain("max-w-0");
    const dragSurface = screen.getByTitle("Drag to move");
    expect(dragSurface.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(dragSurface.className).toContain("!w-[260px]");
    expect(dragSurface.className).not.toContain("!w-[150px]");
    expect(dragSurface.className).toContain("ui-pill-shell");
    expect(dragSurface.style.boxShadow).toBe("");

    const stopButton = screen.getByRole("button", { name: "Stop" });
    expect(stopButton.hasAttribute("data-tauri-drag-region")).toBe(false);
    expect(screen.queryByRole("button", { name: /Mobile/ })).toBeNull();
    fireEvent.click(stopButton);
    expect(stopMutation.mutate).toHaveBeenCalledTimes(1);
  });

  test("labels a manual long recording as a note", async () => {
    renderOverlay(
      recordingState({
        capture_intent: "voice_note",
        system_audio_enabled: false,
      }),
    );
    await expandOverlay();

    expect(screen.getByLabelText("Note recording")).toBeTruthy();
    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByText("1:24")).toBeTruthy();
    expect(screen.queryByText("1:24 · Microphone")).toBeNull();
    expect(screen.queryByText("Microphone")).toBeNull();
    expect(screen.queryByText("You + Them")).toBeNull();
    const recordingSignal = screen.getByTestId("recording-signal");
    expect(recordingSignal.children).toHaveLength(4);
    expect(recordingSignal.className).toContain("looper-recording-signal");

    // Una nota tiene la misma superficie que una reunión: transcript en vivo y
    // Fn para marcar momentos, así que también comprueba el permiso.
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();
    expect(shortcutPermission.check).toHaveBeenCalled();
  });

  test("waits for the native frame before revealing the transcript", async () => {
    let resolvePresentation:
      | ((value: { placement: "above"; sideAlignment: "bottom" }) => void)
      | undefined;
    overlayPresentation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePresentation = resolve;
        }),
    );
    renderOverlay(recordingState());

    fireEvent.click(
      screen.getByRole("button", { name: "Expand recording pill" }),
    );
    expect(screen.queryByLabelText("Live transcript")).toBeNull();

    await act(async () => {
      resolvePresentation?.({
        placement: "above",
        sideAlignment: "bottom",
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();
  });

  test("ignores repeated presentation clicks while the native frame is pending", async () => {
    let resolvePresentation:
      | ((value: { placement: "above"; sideAlignment: "bottom" }) => void)
      | undefined;
    overlayPresentation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePresentation = resolve;
        }),
    );
    renderOverlay(recordingState());

    const expandButton = screen.getByRole("button", {
      name: "Expand recording pill",
    });
    fireEvent.click(expandButton);
    fireEvent.click(expandButton);

    expect(overlayPresentation).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Live transcript")).toBeNull();

    await act(async () => {
      resolvePresentation?.({
        placement: "above",
        sideAlignment: "bottom",
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();
  });

  test("removes the transcript before shrinking the native frame", async () => {
    renderOverlay(recordingState());
    await expandOverlay();
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();

    const collapseButton = screen.getByRole("button", {
      name: "Collapse recording pill",
    });
    collapseButton.focus();
    fireEvent.click(collapseButton);

    expect(screen.queryByLabelText("Live transcript")).toBeNull();
    expect(overlayPresentation).toHaveBeenCalledTimes(2);
    expect(overlayPresentation).toHaveBeenLastCalledWith({
      compact: true,
      transcriptVisible: false,
      transcriptPinned: false,
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Expand recording pill" }),
    );
  });

  test("uses the capture preview while meeting details catch up", async () => {
    const savedSegments = meetingDetails.live_transcript.splice(0);
    renderOverlay(recordingState({ live_transcript: "them: Live words" }));

    await expandOverlay();
    expect(screen.getByText("Live words")).toBeTruthy();
    meetingDetails.live_transcript.push(...savedSegments);
  });

  test("asks about a pinned transcript and renders one inline answer", async () => {
    askMeetingMutation.mutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.(
        "You agreed to own the QA pass and validate reconnect behavior.",
      );
    });
    renderOverlay(recordingState());

    await expandOverlay();
    const input = screen.getByRole("textbox", {
      name: "Ask about this recording",
    });
    fireEvent.change(input, {
      target: { value: "What are my action items?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask recording" }));

    expect(askMeetingMutation.mutate).toHaveBeenCalledWith(
      {
        id: "meeting-1",
        question: "What are my action items?",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByText("What are my action items?")).toBeTruthy();
    expect(
      screen.getByText(
        "You agreed to own the QA pass and validate reconnect behavior.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("From this recording")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close answer" }));
    expect(screen.queryByText("What are my action items?")).toBeNull();
  });

  test("keeps Ask unavailable while compact and without an LLM", async () => {
    renderOverlay(recordingState());
    expect(
      screen.queryByRole("textbox", { name: "Ask about this recording" }),
    ).toBeNull();

    llmSettings.llm_enabled = false;
    await expandOverlay();
    expect(
      screen.queryByRole("textbox", { name: "Ask about this recording" }),
    ).toBeNull();
  });

  test("shows loading and a recoverable inline error", async () => {
    const view = renderOverlay(recordingState());
    await expandOverlay();
    const input = screen.getByRole("textbox", {
      name: "Ask about this recording",
    });
    fireEvent.change(input, { target: { value: "Who owns QA?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask recording" }));

    askMeetingMutation.isPending = true;
    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingCaptureOverlay state={recordingState()} />
      </I18nProvider>,
    );
    expect(screen.getByText("Reading this recording…")).toBeTruthy();

    askMeetingMutation.isPending = false;
    askMeetingMutation.mutate.mock.calls[0][1]?.onError?.(
      new Error("provider unavailable"),
    );
    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingCaptureOverlay state={recordingState()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Couldn’t answer");
    expect(screen.getByText("Who owns QA?")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
  });

  test("follows new transcript history only while the reader is at the end", async () => {
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const view = renderOverlay(recordingState());

    await expandOverlay();
    const scroller = screen.getByTestId("transcript-scroller");
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    fireEvent.scroll(scroller);

    meetingDetails.live_transcript.push({
      id: "segment-4",
      source: "them",
      text: "This arrived while the reader reviewed earlier context.",
      start_ms: 3_000,
      end_ms: 4_000,
    });
    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingCaptureOverlay state={recordingState()} />
      </I18nProvider>,
    );
    expect(
      screen.getByText(
        "This arrived while the reader reviewed earlier context.",
      ),
    ).toBeTruthy();
    expect(scroller.scrollTop).toBe(100);

    scroller.scrollTop = 400;
    fireEvent.scroll(scroller);
    meetingDetails.live_transcript.push({
      id: "segment-5",
      source: "you",
      text: "Auto-follow resumes at the end.",
      start_ms: 4_000,
      end_ms: 5_000,
    });
    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingCaptureOverlay state={recordingState()} />
      </I18nProvider>,
    );
    expect(screen.getByText("Auto-follow resumes at the end.")).toBeTruthy();
    expect(scroller.scrollTop).toBe(600);
    animationFrame.mockRestore();
  });

  test("collapses to the same one-line capsule used by the other pills", async () => {
    renderOverlay(recordingState());

    expect(screen.queryByText("Recording")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Expand recording pill" }),
    ).toBeTruthy();
    expect(screen.getByText("1:24")).toBeTruthy();
    const compactPill = screen.getByLabelText("Meeting recording");
    expect(compactPill.className).toContain("!h-[36px]");
    expect(compactPill.className).toContain("!w-[128px]");
    expect(compactPill.className).not.toContain("h-[42px]");
    expect(compactPill.className).not.toContain("w-[42px]");
    expect(overlayPresentation).not.toHaveBeenCalled();

    await expandOverlay();
    expect(screen.getByText("Recording")).toBeTruthy();
    expect(screen.getByLabelText("Live transcript")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Minimize transcript" }).className,
    ).toContain("h-10 w-10");
  });

  test("expands from the transparent native gutter without enlarging the pill", async () => {
    renderOverlay(recordingState());

    const hitSlop = screen.getByTestId("meeting-compact-hit-slop");
    expect(hitSlop.className).toContain("absolute");
    expect(hitSlop.className).toContain("inset-0");

    fireEvent.click(hitSlop);
    await waitFor(() => {
      expect(overlayPresentation).toHaveBeenCalledWith({
        compact: false,
        transcriptVisible: true,
        transcriptPinned: true,
      });
    });
  });

  test("starts a native drag from both shells but leaves controls clickable", async () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    renderOverlay(recordingState());

    const compactPill = screen.getByTitle("Drag to move");
    fireEvent.pointerDown(compactPill, { button: 0 });
    expect(meetingDrag).toHaveBeenCalledTimes(1);

    const miniPill = screen.getByRole("button", {
      name: "Expand recording pill",
    });
    fireEvent.pointerDown(miniPill, { button: 0 });
    expect(meetingDrag).toHaveBeenCalledTimes(1);
    expect(miniPill.hasAttribute("data-tauri-drag-region")).toBe(false);
    fireEvent.pointerDown(screen.getByLabelText("Meeting recording"), {
      button: 0,
    });
    expect(meetingDrag).toHaveBeenCalledTimes(2);

    await expandOverlay();
    fireEvent.pointerDown(screen.getByTitle("Drag to move"), { button: 0 });
    expect(meetingDrag).toHaveBeenCalledTimes(3);
  });

  test("disables Stop while finalizing without exposing diagnostic warnings", async () => {
    renderOverlay(
      recordingState({
        phase: "finalizing",
        warning:
          "System audio became unavailable; microphone is still recording.",
      }),
    );
    await expandOverlay();

    const saving = screen.getByRole("button", { name: "Saving..." });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.queryByText(
        "System audio became unavailable; microphone is still recording.",
      ),
    ).toBeNull();
  });

  test("acknowledges a captured note, then returns to recording state", () => {
    vi.useFakeTimers();
    renderOverlay(
      recordingState({
        last_note_marker: {
          id: "marker-1",
          captured_at_ms: 84_000,
          start_ms: 54_000,
          end_ms: 84_000,
          created_at: "2026-07-18T10:01:24Z",
        },
      }),
    );

    expect(screen.getByText("Moment saved")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_400));
    expect(screen.getByText("1:24")).toBeTruthy();
  });

  test("keeps the held-note state to one line without a subtitle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:01:00Z"));
    renderOverlay(
      recordingState({
        active_note_selection: {
          started_at: "2026-07-18T10:01:00Z",
          anchor_ms: 60_000,
          initial_duration_ms: 10_000,
          hold_step_ms: 2_000,
          duration_step_ms: 5_000,
          max_duration_ms: 60_000,
        },
      }),
    );

    expect(screen.getByText("Marking moment")).toBeTruthy();
    expect(screen.queryByText(/hold Fn extends/)).toBeNull();

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByText(/0:15 ·/)).toBeNull();
  });

  test("keeps the compact footprint while Fn is held", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:01:00Z"));
    const view = renderOverlay(recordingState());

    expect(screen.queryByText("Recording")).toBeNull();

    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingCaptureOverlay
          state={recordingState({
            active_note_selection: {
              started_at: "2026-07-18T10:01:00Z",
              anchor_ms: 60_000,
              initial_duration_ms: 10_000,
              hold_step_ms: 2_000,
              duration_step_ms: 5_000,
              max_duration_ms: 60_000,
            },
          })}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Marking moment")).toBeTruthy();
    const compactPill = screen.getByTitle("Drag to move");
    expect(compactPill.className).toContain("!h-[36px]");
    expect(compactPill.className).toContain("!w-[128px]");
  });

  test("shows an important moment running forward until Fn is pressed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T10:01:12Z"));
    renderOverlay(
      recordingState({
        active_important_moment: {
          started_at: "2026-07-18T10:01:00Z",
          start_ms: 60_000,
        },
      }),
    );

    expect(screen.getByText("Important moment")).toBeTruthy();
    expect(screen.queryByText(/Press Fn to save this moment/)).toBeNull();
  });

  test("confirms that an important moment becomes searchable", () => {
    renderOverlay(
      recordingState({
        last_note_marker: {
          id: "important-1",
          captured_at_ms: 84_000,
          start_ms: 60_000,
          end_ms: 84_000,
          created_at: "2026-07-18T10:01:24Z",
          kind: "important_moment",
        },
      }),
    );

    expect(screen.getByText("Important moment saved")).toBeTruthy();
    expect(screen.queryByText(/Searchable after transcription/)).toBeNull();
  });
});

describe("groupMeetingTranscriptSegments", () => {
  test("merges adjacent speech from the same source without shortening lines", () => {
    expect(
      groupMeetingTranscriptSegments([
        {
          id: "segment-1",
          source: "them",
          text: "We should ship the transcript first.",
          start_ms: 0,
          end_ms: 1_000,
        },
        {
          id: "segment-2",
          source: "them",
          text: "Then validate reconnect behavior.",
          start_ms: 1_000,
          end_ms: 2_000,
        },
        {
          id: "segment-3",
          source: "you",
          text: "I will own the QA pass.",
          start_ms: 2_000,
          end_ms: 3_000,
        },
      ]),
    ).toEqual([
      {
        id: "segment-1",
        source: "them",
        text: "We should ship the transcript first. Then validate reconnect behavior.",
        start_ms: 0,
        end_ms: 2_000,
      },
      {
        id: "segment-3",
        source: "you",
        text: "I will own the QA pass.",
        start_ms: 2_000,
        end_ms: 3_000,
      },
    ]);
  });
});

describe("meeting note duration", () => {
  test("adds held time to the initial context and caps the result", () => {
    const selection = {
      started_at: "2026-07-18T10:00:00Z",
      anchor_ms: 60_000,
      initial_duration_ms: 10_000,
      hold_step_ms: 2_000,
      duration_step_ms: 5_000,
      max_duration_ms: 60_000,
    };

    expect(
      selectedDurationMs(selection, Date.parse(selection.started_at)),
    ).toBe(10_000);
    expect(
      selectedDurationMs(selection, Date.parse(selection.started_at) + 1_999),
    ).toBe(10_000);
    expect(
      selectedDurationMs(selection, Date.parse(selection.started_at) + 2_000),
    ).toBe(15_000);
    expect(
      selectedDurationMs(selection, Date.parse(selection.started_at) + 4_000),
    ).toBe(20_000);
    expect(
      selectedDurationMs(selection, Date.parse(selection.started_at) + 90_000),
    ).toBe(60_000);
    expect(nextDurationMilestone(10_000, 5_000, 60_000)).toBe(15_000);
    expect(nextDurationMilestone(55_000, 5_000, 60_000)).toBe(60_000);
    expect(
      remainingHoldStepMs(selection, Date.parse(selection.started_at) + 1_200),
    ).toBe(800);
  });
});
