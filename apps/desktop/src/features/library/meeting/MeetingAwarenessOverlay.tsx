import { useLingui } from "@lingui/react/macro";
import { CalendarDots, VideoCamera, X } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import type { MeetingAwarenessState } from "../../../data/meeting/meeting-awareness";
import {
  dismissMeetingAwareness,
  startCalendarMeetingCapture,
  startPromptedMeetingCapture,
} from "../../../data/meeting/meeting-awareness";

export default function MeetingAwarenessOverlay({
  state,
}: {
  state: MeetingAwarenessState;
}) {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callOpened, setCallOpened] = useState(false);
  const meeting = state.meeting;

  useEffect(() => {
    setCallOpened(false);
    setError(null);
  }, [meeting?.id]);

  const detected = state.phase === "detected";

  // La X consume solo este episodio. Las preferencias permanentes de
  // calendario y micrófono siguen perteneciendo a Ajustes.
  const dismissPrompt = async () => {
    try {
      await dismissMeetingAwareness();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (!meeting && !detected) return null;

  const joinAndRecord = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!callOpened && meeting?.meeting_url) {
        await openUrl(meeting.meeting_url);
        setCallOpened(true);
      }
      if (meeting) {
        await startCalendarMeetingCapture(meeting.id);
      } else {
        await startPromptedMeetingCapture();
      }
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
  const closeLabel = t({
    id: "meeting.awareness.close",
    message: "Close meeting suggestion",
  });

  return (
    <div className="fixed inset-0 flex select-none items-start justify-end p-2">
      <div>
        <section
          aria-label={ariaLabel}
          className="ui-overlay-notification relative flex h-[72px] w-[404px] items-center gap-2.5 overflow-hidden rounded-[18px] px-3 text-white"
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
            aria-label={closeLabel}
            className="group relative z-30 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-[var(--ui-capture-muted)] transition-[background-color,color] duration-150 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            onClick={() => void dismissPrompt()}
            title={closeLabel}
            type="button"
          >
            <X aria-hidden="true" size={14} weight="bold" />
          </button>
        </section>
      </div>
    </div>
  );
}
