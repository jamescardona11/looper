import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  disableMeetingAwarenessNotifications,
  getCalendarAccessStatus,
  getMeetingAwarenessState,
  openMeetingNotificationSettings,
  requestCalendarAccess,
  startPromptedMeetingCapture,
  subscribeMeetingAwareness,
} from "./meeting-awareness";

describe("meeting awareness native gateway", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes calendar and prompted-capture commands", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await getMeetingAwarenessState();
    await disableMeetingAwarenessNotifications();
    await openMeetingNotificationSettings();
    await getCalendarAccessStatus();
    await requestCalendarAccess();
    await startPromptedMeetingCapture();

    expect(tauri.invoke.mock.calls.map(([command]) => command)).toEqual([
      "get_meeting_awareness_state",
      "disable_meeting_awareness_notifications",
      "open_meeting_notification_settings",
      "get_calendar_access_status",
      "request_calendar_access",
      "start_prompted_meeting_capture",
    ]);
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
