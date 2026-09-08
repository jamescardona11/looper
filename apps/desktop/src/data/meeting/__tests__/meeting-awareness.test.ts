import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  observeMeetingAwareness,
  dismissMeetingAwareness,
  disableMeetingAwarenessNotifications,
  getCalendarAccessStatus,
  getMeetingAwarenessState,
  openMeetingNotificationSettings,
  requestCalendarAccess,
  startCalendarMeetingCapture,
  startPromptedMeetingCapture,
  subscribeMeetingAwareness,
} from "../meeting-awareness";

describe("meeting awareness native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("subscribes before reading the initial state", async () => {
    let finishListening!: (stop: () => void) => void;
    tauri.listen.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishListening = resolve;
        }),
    );
    tauri.invoke.mockResolvedValue({ phase: "detected" });
    const handler = vi.fn();
    const observation = observeMeetingAwareness(handler);
    expect(tauri.invoke).not.toHaveBeenCalled();
    finishListening(vi.fn());
    await observation;
    expect(handler).toHaveBeenCalledWith({ phase: "detected" });
  });

  test("a late idle snapshot cannot erase a detected meeting", async () => {
    let finishSnapshot!: (state: { phase: string }) => void;
    tauri.listen.mockResolvedValue(vi.fn());
    tauri.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSnapshot = resolve;
        }),
    );
    const handler = vi.fn();
    const observation = observeMeetingAwareness(handler);
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalled());
    tauri.listen.mock.calls[0][1]({ payload: { phase: "detected" } });
    finishSnapshot({ phase: "idle" });
    await observation;
    expect(handler.mock.calls).toEqual([[{ phase: "detected" }]]);
  });

  test("a late detected snapshot cannot restore an expired meeting", async () => {
    let finishSnapshot!: (state: { phase: string }) => void;
    tauri.listen.mockResolvedValue(vi.fn());
    tauri.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSnapshot = resolve;
        }),
    );
    const handler = vi.fn();
    const observation = observeMeetingAwareness(handler);
    await vi.waitFor(() => expect(tauri.invoke).toHaveBeenCalled());
    tauri.listen.mock.calls[0][1]({ payload: { phase: "idle" } });
    finishSnapshot({ phase: "detected" });
    await observation;
    expect(handler.mock.calls).toEqual([[{ phase: "idle" }]]);
  });

  test("keeps receiving live events if the snapshot fails", async () => {
    const stop = vi.fn();
    tauri.listen.mockResolvedValue(stop);
    tauri.invoke.mockRejectedValue(new Error("unavailable"));
    const handler = vi.fn();
    const unsubscribe = await observeMeetingAwareness(handler);
    expect(stop).not.toHaveBeenCalled();
    tauri.listen.mock.calls[0][1]({ payload: { phase: "detected" } });
    expect(handler).toHaveBeenCalledWith({ phase: "detected" });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("unsubscribes without waiting for a pending snapshot", async () => {
    let finishSnapshot!: (state: { phase: string }) => void;
    const stop = vi.fn();
    tauri.listen.mockResolvedValue(stop);
    tauri.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSnapshot = resolve;
        }),
    );
    const handler = vi.fn();
    const unsubscribe = await observeMeetingAwareness(handler);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
    finishSnapshot({ phase: "detected" });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  test("routes calendar and prompted-capture commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await getMeetingAwarenessState();
    await dismissMeetingAwareness();
    await disableMeetingAwarenessNotifications("microphone");
    await openMeetingNotificationSettings();
    await getCalendarAccessStatus();
    await requestCalendarAccess();
    await startCalendarMeetingCapture("calendar-event-1");
    await startPromptedMeetingCapture();

    expect(tauri.invoke.mock.calls.map(([command]) => command)).toEqual([
      "get_meeting_awareness_state",
      "dismiss_meeting_awareness",
      "disable_meeting_awareness_notifications",
      "open_meeting_notification_settings",
      "get_calendar_access_status",
      "request_calendar_access",
      "start_calendar_meeting_capture",
      "start_prompted_meeting_capture",
    ]);
    expect(tauri.invoke).toHaveBeenCalledWith(
      "disable_meeting_awareness_notifications",
      { source: "microphone" },
    );
    expect(tauri.invoke).toHaveBeenCalledWith(
      "start_calendar_meeting_capture",
      { eventId: "calendar-event-1" },
    );
  });

  test("unwraps meeting awareness state events", async () => {
    const handler = vi.fn();
    tauri.listen.mockResolvedValue(vi.fn());
    await subscribeMeetingAwareness(handler);

    const state = {
      phase: "upcoming",
      meeting: {
        id: "meeting-1",
        external_id: "external-1",
        calendar_id: "calendar-1",
        title: "Weekly review",
        started_at: "2026-08-16T15:00:00Z",
        ended_at: "2026-08-16T15:30:00Z",
        attendee_count: 4,
      },
      seconds_until_start: 120,
    };
    tauri.listen.mock.calls[0]?.[1]({ payload: state });

    expect(tauri.listen).toHaveBeenCalledWith(
      "meeting:awareness_state",
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(state);
  });
});
