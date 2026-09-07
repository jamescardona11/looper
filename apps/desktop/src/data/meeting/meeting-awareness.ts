import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { MeetingCaptureState } from "../../contracts";

export type CalendarMeeting = {
  id: string;
  external_id: string;
  calendar_id: string;
  series_id?: string | null;
  occurrence_id?: string | null;
  title: string;
  started_at: string;
  ended_at: string;
  meeting_url?: string | null;
  organizer?: string | null;
  attendee_count: number;
};

export type MeetingAwarenessState = {
  phase: "idle" | "upcoming" | "ready" | "detected";
  meeting?: CalendarMeeting | null;
  seconds_until_start?: number | null;
};

export type CalendarAccessStatus =
  "unsupported" | "not_determined" | "authorized" | "denied";

export type MeetingAwarenessSource = "calendar" | "microphone";

export const getMeetingAwarenessState = () =>
  invoke<MeetingAwarenessState>("get_meeting_awareness_state");

export const dismissMeetingAwareness = () =>
  invoke<void>("dismiss_meeting_awareness");

export const subscribeMeetingAwareness = (
  handler: (state: MeetingAwarenessState) => void,
) =>
  listen<MeetingAwarenessState>("meeting:awareness_state", ({ payload }) =>
    handler(payload),
  );

export const disableMeetingAwarenessNotifications = (
  source: MeetingAwarenessSource,
) => invoke<void>("disable_meeting_awareness_notifications", { source });

export const openMeetingNotificationSettings = () =>
  invoke<void>("open_meeting_notification_settings");

export const getCalendarAccessStatus = () =>
  invoke<CalendarAccessStatus>("get_calendar_access_status");

export const requestCalendarAccess = () =>
  invoke<boolean>("request_calendar_access");

export const startCalendarMeetingCapture = (
  eventId: string,
): Promise<MeetingCaptureState> =>
  invoke("start_calendar_meeting_capture", { eventId });

export const startPromptedMeetingCapture = (): Promise<MeetingCaptureState> =>
  invoke("start_prompted_meeting_capture");
