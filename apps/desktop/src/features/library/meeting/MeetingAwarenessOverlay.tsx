import { useLingui } from "@lingui/react/macro";
import {
  CalendarDots,
  DownloadSimple,
  GearSix,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { runToastAction } from "../../../data/capture/toast";
import {
  type CaptureRecovery,
  captureStartError,
  CaptureStartError,
  captureRecoveryActions,
} from "../../../data/meeting/capture-start-error";
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
  return (
    <MeetingAwarenessContent
      key={state.meeting?.id ?? state.phase}
      state={state}
    />
  );
}

function MeetingAwarenessContent({ state }: { state: MeetingAwarenessState }) {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CaptureStartError | null>(null);
  const [callOpened, setCallOpened] = useState(false);
  const meeting = state.meeting;

  const detected = state.phase === "detected";

  // La X consume solo este episodio. Las preferencias permanentes de
  // calendario y micrófono siguen perteneciendo a Ajustes.
  const dismissPrompt = async () => {
    try {
      await dismissMeetingAwareness();
    } catch (cause) {
      setError(captureStartError(cause));
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
      setError(captureStartError(cause));
    } finally {
      setBusy(false);
    }
  };

  const recovery = error?.recovery;
  const openRecovery = async () => {
    if (busy || !recovery) return;
    setBusy(true);
    try {
      await runToastAction(captureRecoveryActions[recovery].command);
      setError(null);
    } catch (cause) {
      setError(
        new CaptureStartError(captureStartError(cause).message, recovery),
      );
    } finally {
      setBusy(false);
    }
  };

  const title = detected
    ? t({ id: "meeting.awareness.call_detected", message: "Call detected" })
    : t({
        id: "meeting.awareness.meeting_starting",
        message: "Meeting starting",
      });
  const meta = error
    ? error.message
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
          className="ui-overlay-notification relative flex h-[72px] w-[404px] items-center gap-2.5 overflow-hidden rounded-[18px] px-3"
        >
          <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-accent/20 bg-accent/10">
            <SignalIcon size={19} weight="fill" className="text-accent" />
          </div>

          <div className="relative z-10 min-w-0 flex-1">
            <p className="ui-text-body-sm truncate font-semibold tracking-[-0.01em] text-content-primary">
              {title}
            </p>
            <p
              role={error ? "alert" : undefined}
              title={meta}
              className={`${error ? "line-clamp-2 break-words" : "truncate"} text-[10px] leading-4 ${
                error ? "text-error" : "text-content-secondary"
              }`}
            >
              {meta}
            </p>
          </div>

          <CaptureActionButton
            busy={busy}
            recovery={recovery ?? null}
            callOpened={callOpened}
            detected={detected}
            onClick={() => void (recovery ? openRecovery() : joinAndRecord())}
          />

          <button
            aria-label={closeLabel}
            className="group relative z-30 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-content-secondary transition-[background-color,color] duration-150 hover:bg-surface-hover hover:text-content-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
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

const captureActionIcons = {
  models: DownloadSimple,
  microphone: GearSix,
  system_audio: GearSix,
  retry: VideoCamera,
  record: VideoCamera,
  join: VideoCamera,
};

function CaptureActionButton({
  busy,
  recovery,
  callOpened,
  detected,
  onClick,
}: {
  busy: boolean;
  recovery: CaptureRecovery | null;
  callOpened: boolean;
  detected: boolean;
  onClick: () => void;
}) {
  const { t } = useLingui();
  const mode =
    recovery ?? (callOpened ? "retry" : detected ? "record" : "join");
  const recoveryLabels = {
    models: t({ id: "capture.recovery.models", message: "Get model" }),
    microphone: t({ id: "capture.recovery.microphone", message: "Allow mic" }),
    system_audio: t({
      id: "capture.recovery.system_audio",
      message: "Allow audio",
    }),
  };
  const labels = {
    ...recoveryLabels,
    retry: t({ id: "meeting.awareness.retry", message: "Retry" }),
    record: t({ id: "meeting.awareness.record", message: "Record" }),
    join: t({ id: "meeting.awareness.take_notes", message: "Take notes" }),
  };
  const ariaLabels = {
    ...recoveryLabels,
    retry: t({
      id: "meeting.awareness.retry_recording",
      message: "Retry meeting recording",
    }),
    record: t({
      id: "meeting.awareness.start_detected_call",
      message: "Start recording this call",
    }),
    join: t({
      id: "meeting.awareness.join_and_record",
      message: "Join meeting and start recording",
    }),
  };
  const busyLabel = recovery
    ? t({ id: "capture.recovery.opening", message: "Opening…" })
    : t({ id: "meeting.awareness.starting", message: "Starting…" });
  const ActionIcon = captureActionIcons[mode];
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      aria-label={ariaLabels[mode]}
      title={ariaLabels[mode]}
      className="ui-text-label relative z-30 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] border border-accent bg-accent px-3 font-semibold ui-color-on-solid transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-60"
    >
      <ActionIcon aria-hidden="true" size={13} weight="fill" />
      {busy ? busyLabel : labels[mode]}
    </button>
  );
}
