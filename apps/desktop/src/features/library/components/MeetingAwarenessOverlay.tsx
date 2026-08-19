import { useLingui } from "@lingui/react/macro";
import {
  CalendarDots,
  VideoCamera,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { MeetingAwarenessState } from "../../../data/meeting-awareness";
import {
  disableMeetingAwarenessNotifications,
  dismissMeetingAwareness,
  openMeetingNotificationSettings,
  startPromptedMeetingCapture,
} from "../../../data/meeting-awareness";

export default function MeetingAwarenessOverlay({
  state,
}: {
  state: MeetingAwarenessState;
}) {
  const DISMISSAL_PROMPT_THRESHOLD = 3;
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callOpened, setCallOpened] = useState(false);
  const [dismissalCount, setDismissalCount] = useState(0);
  const [settingsPromptOpen, setSettingsPromptOpen] = useState(false);
  const meeting = state.meeting;

  useEffect(() => {
    setCallOpened(false);
    setError(null);
  }, [meeting?.id]);

  const detected = state.phase === "detected";
  const dismissCurrentReminder = async () => {
    const nextDismissalCount = dismissalCount + 1;
    setDismissalCount(nextDismissalCount);
    await dismissMeetingAwareness();
    if (nextDismissalCount >= DISMISSAL_PROMPT_THRESHOLD) {
      setDismissalCount(0);
      setSettingsPromptOpen(true);
    }
  };

  // Descartar es "ahora no"; esto es "nunca más". Apaga los avisos de reunión
  // en Ajustes, de donde el usuario puede volver a encenderlos.
  const neverShowAgain = async () => {
    try {
      await disableMeetingAwarenessNotifications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const keepNotificationsAsIs = () => {
    setSettingsPromptOpen(false);
  };

  const manageNotifications = async () => {
    setSettingsPromptOpen(false);
    await openMeetingNotificationSettings();
  };

  if (!meeting && !detected && !settingsPromptOpen) return null;

  if (settingsPromptOpen) {
    return (
      <div className="fixed inset-0 flex select-none items-start justify-end p-2">
        <section
          aria-labelledby="meeting-notification-settings-title"
          aria-modal="true"
          className="ui-overlay-notification relative flex h-[112px] w-[404px] flex-col rounded-[18px] px-3 py-2.5 text-white"
          role="dialog"
        >
          <div className="relative z-10 flex items-center gap-2">
            <WarningCircle
              aria-hidden="true"
              className="shrink-0 text-red-400"
              size={18}
              weight="fill"
            />
            <p
              className="ui-text-body-sm min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] text-[var(--ui-capture-fg-strong)]"
              id="meeting-notification-settings-title"
            >
              {t({
                id: "meeting.awareness.disable_notifications.title",
                message: "Disable meeting notifications?",
              })}
            </p>
            <button
              aria-label={t({
                id: "meeting.awareness.disable_notifications.close",
                message: "Close",
              })}
              className="relative z-30 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/35 text-[var(--ui-capture-muted)] transition-colors duration-150 hover:bg-white/8 hover:text-white"
              onClick={keepNotificationsAsIs}
              title={t({
                id: "meeting.awareness.disable_notifications.close",
                message: "Close",
              })}
              type="button"
            >
              <X aria-hidden="true" size={13} weight="bold" />
            </button>
          </div>
          <p className="relative z-10 mt-1.5 ui-text-micro leading-4 text-[var(--ui-capture-muted)]">
            {t({
              id: "meeting.awareness.disable_notifications.body",
              message:
                "You've closed the last few meeting notifications. You can change when we notify you about meetings.",
            })}
          </p>
          <div className="relative z-10 mt-auto flex justify-end gap-2">
            <button
              className="ui-text-label inline-flex h-8 items-center rounded-[10px] bg-white/12 px-3 font-semibold text-[var(--ui-capture-fg-strong)] transition-colors hover:bg-white/18"
              onClick={keepNotificationsAsIs}
              type="button"
            >
              {t({
                id: "meeting.awareness.disable_notifications.keep",
                message: "Keep as is",
              })}
            </button>
            <button
              className="ui-text-label inline-flex h-8 items-center rounded-[10px] bg-[var(--ui-capture-fg-strong)] px-3 font-semibold text-[var(--color-mask-opaque)] transition-opacity hover:opacity-90"
              onClick={() => void manageNotifications()}
              type="button"
            >
              {t({
                id: "meeting.awareness.disable_notifications.manage",
                message: "Manage notifications",
              })}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const joinAndRecord = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!callOpened && meeting?.meeting_url) {
        await openUrl(meeting.meeting_url);
        setCallOpened(true);
      }
      await startPromptedMeetingCapture();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const actionAriaLabel = callOpened
    ? t({
        id: "meeting.awareness.retry_recording",
        message: "Retry meeting recording",
      })
    : detected
      ? t({
          id: "meeting.awareness.start_detected_call",
          message: "Start recording this call",
        })
      : t({
          id: "meeting.awareness.join_and_record",
          message: "Join meeting and start recording",
        });
  const actionLabel = busy
    ? t({ id: "meeting.awareness.starting", message: "Starting…" })
    : callOpened
      ? t({ id: "meeting.awareness.retry", message: "Retry" })
      : detected
        ? t({ id: "meeting.awareness.record", message: "Record" })
        : t({ id: "meeting.awareness.take_notes", message: "Take notes" });
  const title = detected
    ? t({ id: "meeting.awareness.call_detected", message: "Call detected" })
    : t({
        id: "meeting.awareness.meeting_starting",
        message: "Meeting starting",
      });
  const meta = error
    ? error
    : detected
      ? t({
          id: "meeting.awareness.microphone_active",
          message: "Your microphone is active",
        })
      : (meeting?.title ??
        t({
          id: "meeting.awareness.calendar_meeting",
          message: "Calendar meeting",
        }));
  const ariaLabel = detected
    ? t({ id: "meeting.awareness.detected_call", message: "Detected call" })
    : t({
        id: "meeting.awareness.meeting_label",
        message: `Meeting: ${meeting?.title ?? ""}`,
      });
  const SignalIcon = detected ? VideoCamera : CalendarDots;
  const neverShowAgainLabel = t({
    id: "meeting.awareness.never_show_again",
    message: "Don't show meeting notifications again",
  });

  return (
    <div className="fixed inset-0 flex select-none items-start justify-end p-2">
      <div className="relative">
        <button
          aria-label={neverShowAgainLabel}
          className="absolute -left-1.5 -top-1.5 z-40 grid h-5 w-5 place-items-center rounded-full border border-white/20 bg-[var(--color-mask-opaque)] text-[var(--ui-capture-muted)] transition-colors duration-150 hover:bg-white/15 hover:text-white"
          onClick={() => void neverShowAgain()}
          title={neverShowAgainLabel}
          type="button"
        >
          <X aria-hidden="true" size={10} weight="bold" />
        </button>
        <section
          aria-label={ariaLabel}
          className="ui-overlay-notification relative flex h-[72px] w-[404px] items-center gap-3 overflow-hidden rounded-[18px] px-3 text-white"
        >
          <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-white/10 bg-white/6 [box-shadow:var(--ui-notification-icon-shadow)]">
            <SignalIcon
              size={19}
              weight="fill"
              className="text-[var(--color-meeting-awareness)]"
            />
          </div>

          <div className="relative z-10 min-w-0 flex-1">
            <p className="ui-text-body-sm truncate font-semibold tracking-[-0.01em] text-[var(--ui-capture-fg-strong)]">
              {title}
            </p>
            <p
              role={error ? "alert" : undefined}
              title={meta}
              className={`truncate text-[10px] leading-4 ${
                error ? "text-error" : "text-[var(--ui-capture-muted)]"
              }`}
            >
              {meta}
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void joinAndRecord()}
            aria-label={actionAriaLabel}
            title={actionAriaLabel}
            className="ui-text-label relative z-30 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] border border-white/30 bg-[var(--ui-capture-fg-strong)] px-3 font-semibold text-[var(--color-mask-opaque)] [box-shadow:var(--ui-notification-action-shadow)] transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
          >
            <VideoCamera size={13} weight="fill" />
            {actionLabel}
          </button>

          <button
            type="button"
            onClick={() => void dismissCurrentReminder()}
            aria-label={t({
              id: "meeting.awareness.dismiss_reminder",
              message: "Dismiss meeting reminder",
            })}
            className="ui-text-label relative z-30 inline-flex h-8 shrink-0 items-center justify-center rounded-[10px] px-2 text-[var(--ui-capture-muted)] transition-colors duration-150 hover:bg-white/8 hover:text-white"
          >
            {t({ id: "meeting.awareness.dismiss", message: "Dismiss" })}
          </button>
        </section>
      </div>
    </div>
  );
}
