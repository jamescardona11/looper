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
import type { MeetingAwarenessState } from "../../../../data/meeting/meeting-awareness";
import MeetingAwarenessOverlay from "../MeetingAwarenessOverlay";

const meetingActions = vi.hoisted(() => ({
  dismissAwareness: vi.fn(),
  disableNotifications: vi.fn(),
  startCalendarCapture: vi.fn(),
  startPromptedCapture: vi.fn(),
  openUrl: vi.fn(),
}));
vi.mock("../../../../data/meeting/meeting-awareness", () => ({
  dismissMeetingAwareness: meetingActions.dismissAwareness,
  disableMeetingAwarenessNotifications: meetingActions.disableNotifications,
  startCalendarMeetingCapture: meetingActions.startCalendarCapture,
  startPromptedMeetingCapture: meetingActions.startPromptedCapture,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: meetingActions.openUrl,
}));

const awarenessState: MeetingAwarenessState = {
  phase: "upcoming",
  meeting: {
    id: "calendar-event-1",
    external_id: "external-1",
    calendar_id: "calendar-1",
    title: "Weekly planning",
    started_at: "2026-07-21T15:00:00Z",
    ended_at: "2026-07-21T15:30:00Z",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    organizer: "team@example.com",
    attendee_count: 4,
  },
};

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "en",
  messages: {
    "meeting.awareness.retry_recording": "Retry meeting recording",
    "meeting.awareness.start_detected_call": "Start recording this call",
    "meeting.awareness.join_and_record": "Join meeting and start recording",
    "meeting.awareness.starting": "Starting…",
    "meeting.awareness.retry": "Retry",
    "meeting.awareness.record": "Record",
    "meeting.awareness.take_notes": "Take notes",
    "meeting.awareness.call_detected": "Call detected",
    "meeting.awareness.meeting_starting": "Meeting starting",
    "meeting.awareness.microphone_active": "Your microphone is active",
    "meeting.awareness.calendar_meeting": "Calendar meeting",
    "meeting.awareness.detected_call": "Detected call",
    "meeting.awareness.meeting_label": "Meeting: {0}",
    "meeting.awareness.disable_microphone_suggestions":
      "Don't suggest recording when the microphone is active",
    "meeting.awareness.disable_calendar_reminders":
      "Don't show Calendar meeting reminders",
    "meeting.awareness.close": "Close meeting suggestion",
  },
});

const renderAwareness = (state: MeetingAwarenessState) =>
  render(
    <I18nProvider i18n={i18n}>
      <MeetingAwarenessOverlay state={state} />
    </I18nProvider>,
  );

afterEach(() => {
  cleanup();
  meetingActions.dismissAwareness.mockReset();
  meetingActions.disableNotifications.mockReset();
  meetingActions.startCalendarCapture.mockReset();
  meetingActions.startPromptedCapture.mockReset();
  meetingActions.openUrl.mockReset();
});

describe("MeetingAwarenessOverlay", () => {
  test("matches the shared notification width inside its native gutter", () => {
    renderAwareness(awarenessState);

    const notification = screen.getByRole("region", {
      name: "Meeting: Weekly planning",
    });
    const surface = notification.parentElement?.parentElement;
    expect(surface?.className).toContain("fixed inset-0");
    expect(surface?.className).toContain("p-2");
    expect(notification.className).toContain("h-[72px]");
    expect(notification.className).toContain("w-[404px]");
  });

  test("opens the call and starts recording from the same Signal Rail", async () => {
    meetingActions.openUrl.mockResolvedValue(undefined);
    meetingActions.startCalendarCapture.mockResolvedValue(undefined);
    renderAwareness(awarenessState);

    expect(screen.getByText("Meeting starting")).toBeTruthy();
    expect(screen.getByText("Weekly planning")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Join meeting and start recording",
      }),
    );

    await waitFor(() => {
      expect(meetingActions.openUrl).toHaveBeenCalledWith(
        "https://meet.google.com/abc-defg-hij",
      );
      expect(meetingActions.startCalendarCapture).toHaveBeenCalledWith(
        "calendar-event-1",
      );
    });
    expect(meetingActions.openUrl.mock.invocationCallOrder[0]).toBeLessThan(
      meetingActions.startCalendarCapture.mock.invocationCallOrder[0],
    );
  });

  test("prevents duplicate call and recording starts while the first is pending", async () => {
    let finishOpening: (() => void) | undefined;
    meetingActions.openUrl.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishOpening = resolve;
        }),
    );
    meetingActions.startCalendarCapture.mockResolvedValue(undefined);
    renderAwareness(awarenessState);

    const action = screen.getByRole("button", {
      name: "Join meeting and start recording",
    });
    fireEvent.click(action);
    fireEvent.click(action);

    expect(meetingActions.openUrl).toHaveBeenCalledTimes(1);
    expect((action as HTMLButtonElement).disabled).toBe(true);

    finishOpening?.();
    await waitFor(() => {
      expect(meetingActions.startCalendarCapture).toHaveBeenCalledWith(
        "calendar-event-1",
      );
    });
  });

  test("keeps the clicked Calendar event ID when awareness changes while opening", async () => {
    let finishOpening: (() => void) | undefined;
    meetingActions.openUrl.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishOpening = resolve;
        }),
    );
    meetingActions.startCalendarCapture.mockResolvedValue(undefined);
    const view = renderAwareness(awarenessState);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Join meeting and start recording",
      }),
    );

    view.rerender(
      <I18nProvider i18n={i18n}>
        <MeetingAwarenessOverlay
          state={{
            ...awarenessState,
            meeting: {
              ...awarenessState.meeting!,
              id: "calendar-event-2",
              title: "Next meeting",
            },
          }}
        />
      </I18nProvider>,
    );

    finishOpening?.();
    await waitFor(() => {
      expect(meetingActions.startCalendarCapture).toHaveBeenCalledWith(
        "calendar-event-1",
      );
    });
    expect(meetingActions.startCalendarCapture).not.toHaveBeenCalledWith(
      "calendar-event-2",
    );
  });

  test("still joins the call when recording cannot start", async () => {
    meetingActions.openUrl.mockResolvedValue(undefined);
    meetingActions.startCalendarCapture.mockRejectedValue(
      new Error("Microphone permission is required"),
    );
    renderAwareness(awarenessState);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Join meeting and start recording",
      }),
    );

    expect(
      await screen.findByText("Microphone permission is required"),
    ).toBeTruthy();
    expect(meetingActions.openUrl).toHaveBeenCalledTimes(1);
  });

  test("retries recording without reopening the call", async () => {
    meetingActions.openUrl.mockResolvedValue(undefined);
    meetingActions.startCalendarCapture
      .mockRejectedValueOnce(new Error("Microphone permission is required"))
      .mockResolvedValueOnce(undefined);
    renderAwareness(awarenessState);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Join meeting and start recording",
      }),
    );

    expect(
      await screen.findByText("Microphone permission is required"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry meeting recording" }),
    );

    await waitFor(() => {
      expect(meetingActions.startCalendarCapture).toHaveBeenCalledTimes(2);
      expect(meetingActions.startCalendarCapture).toHaveBeenLastCalledWith(
        "calendar-event-1",
      );
    });
    expect(meetingActions.openUrl).toHaveBeenCalledTimes(1);
  });

  test("a racing Dictation rejects meeting capture after the call opens", async () => {
    meetingActions.openUrl.mockResolvedValue(undefined);
    meetingActions.startCalendarCapture.mockRejectedValue(
      new Error("Finish the current dictation before recording a meeting."),
    );
    renderAwareness(awarenessState);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Join meeting and start recording",
      }),
    );

    expect(
      await screen.findByText(
        "Finish the current dictation before recording a meeting.",
      ),
    ).toBeTruthy();
    expect(meetingActions.openUrl).toHaveBeenCalledTimes(1);
    expect(meetingActions.openUrl.mock.invocationCallOrder[0]).toBeLessThan(
      meetingActions.startCalendarCapture.mock.invocationCallOrder[0],
    );
  });

  test("renders a dedicated notification card instead of a movable pill", () => {
    renderAwareness(awarenessState);

    const notification = screen.getByLabelText("Meeting: Weekly planning");
    expect(notification.className).toContain("ui-overlay-notification");
    expect(screen.getByText("Meeting starting")).toBeTruthy();
    expect(screen.getByText("Weekly planning")).toBeTruthy();
    expect(screen.getByText("Take notes")).toBeTruthy();
    expect(document.querySelector("[data-overlay-drag-handle]")).toBeNull();
  });

  test("a call detected by the microphone still shows a usable prompt", () => {
    // Sin evento de calendario no hay título ni hora: antes el overlay
    // devolvía null y la píldora salía vacía.
    renderAwareness({ phase: "detected", meeting: undefined });

    expect(screen.getByText("Call detected")).toBeTruthy();
    expect(screen.getByText("Your microphone is active")).toBeTruthy();
    // No hay evento al que unirse: el botón ofrece grabar, no unirse.
    expect(screen.getByTitle("Start recording this call")).toBeTruthy();
    expect(screen.getByText("Record")).toBeTruthy();
    expect(screen.queryByText("Join")).toBeNull();
  });

  test("starts an unscheduled capture without a Calendar event ID", async () => {
    meetingActions.startPromptedCapture.mockResolvedValue(undefined);
    renderAwareness({ phase: "detected", meeting: undefined });

    fireEvent.click(
      screen.getByRole("button", { name: "Start recording this call" }),
    );

    await waitFor(() => {
      expect(meetingActions.startPromptedCapture).toHaveBeenCalledTimes(1);
    });
    expect(meetingActions.startCalendarCapture).not.toHaveBeenCalled();
  });

  test("the inset X dismisses only the current suggestion", async () => {
    meetingActions.dismissAwareness.mockResolvedValue(undefined);
    renderAwareness({ phase: "detected", meeting: undefined });

    expect(screen.getAllByRole("button")).toHaveLength(2);

    const close = screen.getByLabelText("Close meeting suggestion");
    expect(close.className).toContain("h-10");
    expect(close.className).toContain("w-10");
    expect(close.className).not.toContain("absolute");
    expect(close.parentElement).toBe(screen.getByLabelText("Detected call"));

    fireEvent.click(close);
    await waitFor(() =>
      expect(meetingActions.dismissAwareness).toHaveBeenCalledTimes(1),
    );
    expect(meetingActions.disableNotifications).not.toHaveBeenCalled();
  });

  test("the same close control dismisses a Calendar suggestion", async () => {
    meetingActions.dismissAwareness.mockResolvedValue(undefined);
    renderAwareness(awarenessState);

    fireEvent.click(screen.getByLabelText("Close meeting suggestion"));

    await waitFor(() =>
      expect(meetingActions.dismissAwareness).toHaveBeenCalledTimes(1),
    );
    expect(meetingActions.disableNotifications).not.toHaveBeenCalled();
  });

  test("a failed dismiss says so instead of pretending it worked", async () => {
    meetingActions.dismissAwareness.mockRejectedValue(
      new Error("notification could not close"),
    );
    renderAwareness({ phase: "detected", meeting: undefined });

    fireEvent.click(screen.getByLabelText("Close meeting suggestion"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "notification could not close",
      ),
    );
  });
});
