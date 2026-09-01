import { useLingui } from "@lingui/react/macro";
import {
  BookmarkSimple,
  CheckCircle,
  Key,
  Sparkle,
  Stop,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MeetingCaptureState } from "../../../contracts";
import { beginOverlayDrag } from "../../../data/capture/dictation";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { SignalRail } from "../../pill/SignalRail";
import { useMeetingDetails, useStopMeetingCapture } from "../queries";
import {
  setMeetingOverlayPresentation,
  type MeetingTranscriptPlacement,
  type MeetingTranscriptSideAlignment,
} from "../../../data/capture/overlay";
import {
  checkShortcutPermission,
  openShortcutPermissionHelp,
  retryShortcuts,
} from "../../../data/capture/shortcuts";
import { formatDuration } from "../shared/library-utils";
import { selectedDurationMs } from "./meeting-note-duration";
import { MeetingTranscriptPanel } from "./MeetingTranscriptPanel";

const NOTE_SAVED_VISIBLE_MS = 2_400;
const TRANSCRIPT_PANEL_ID = "meeting-live-transcript";

const beginMeetingDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
  const target = event.target;
  if (
    event.button !== 0 ||
    (target instanceof Element && target.closest("button"))
  ) {
    return;
  }
  void beginOverlayDrag().catch((error) =>
    console.error("Failed to drag meeting pill:", error),
  );
};

const RecordingSignal = () => (
  <span
    aria-hidden="true"
    data-testid="recording-signal"
    className="looper-recording-signal"
  >
    <span />
    <span />
    <span />
    <span />
  </span>
);

const MeetingCaptureOverlay = ({ state }: { state: MeetingCaptureState }) => {
  const { t } = useLingui();
  const stop = useStopMeetingCapture();
  const meetingId = state.id ?? "";
  const voiceNote = state.capture_intent === "voice_note";
  // El audio ya está a salvo; lo que sigue corriendo es la transcripción y el
  // resumen, y la píldora se queda para que ese trabajo no sea invisible.
  const processing = state.phase === "processing";
  const { data: details } = useMeetingDetails(meetingId, meetingId.length > 0);
  const selection = state.active_note_selection ?? null;
  const importantMoment = state.active_important_moment ?? null;
  const markerId = state.last_note_marker?.id ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [visibleMarkerId, setVisibleMarkerId] = useState<string | null>(
    markerId,
  );
  const [compact, setCompact] = useState(true);
  const [placement, setPlacement] =
    useState<MeetingTranscriptPlacement>("above");
  const [sideAlignment, setSideAlignment] =
    useState<MeetingTranscriptSideAlignment>("bottom");
  const [shortcutPermission, setShortcutPermission] = useState<boolean | null>(
    null,
  );
  const presentationRequestInFlight = useRef(false);
  const signalButtonRef = useRef<HTMLButtonElement>(null);

  useMountEffect(() => {
    let cancelled = false;
    let shortcutWasReady = false;
    let pollTimer: number | null = null;

    const refreshShortcutPermission = async () => {
      try {
        const permitted = await checkShortcutPermission();
        if (cancelled) return;
        if (permitted && !shortcutWasReady) {
          await retryShortcuts();
          if (cancelled) return;
        }
        shortcutWasReady = permitted;
        setShortcutPermission(permitted);
        if (permitted) {
          if (pollTimer != null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      } catch (error) {
        if (!cancelled) {
          shortcutWasReady = false;
          setShortcutPermission(false);
          console.error("Failed to verify meeting shortcut:", error);
        }
      }
    };

    void refreshShortcutPermission();
    pollTimer = window.setInterval(refreshShortcutPermission, 1_500);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
    };
  });

  const transcriptVisible = !compact;

  const applyOverlayPresentation = (
    next: Parameters<typeof setMeetingOverlayPresentation>[0],
  ) => {
    return setMeetingOverlayPresentation(next)
      .then(({ placement: nextPlacement, sideAlignment: nextAlignment }) => {
        setPlacement(nextPlacement);
        setSideAlignment(nextAlignment);
        return true;
      })
      .catch((error) => {
        console.error("Failed to update meeting overlay presentation:", error);
        return false;
      });
  };

  const toggleCompact = async () => {
    if (presentationRequestInFlight.current) return;
    presentationRequestInFlight.current = true;
    try {
      if (compact) {
        const applied = await applyOverlayPresentation({
          compact: false,
          transcriptVisible: true,
          transcriptPinned: true,
        });
        if (applied) setCompact(false);
        return;
      }

      setCompact(true);
      const applied = await applyOverlayPresentation({
        compact: true,
        transcriptVisible: false,
        transcriptPinned: false,
      });
      if (!applied) setCompact(false);
      else requestAnimationFrame(() => signalButtonRef.current?.focus());
    } finally {
      presentationRequestInFlight.current = false;
    }
  };

  useEffect(() => {
    if (!selection && !importantMoment) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [importantMoment, selection]);

  useEffect(() => {
    if (!markerId) return;
    setVisibleMarkerId(markerId);
    const timer = window.setTimeout(
      () => setVisibleMarkerId(null),
      NOTE_SAVED_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [markerId]);

  const selectedMs = selection ? selectedDurationMs(selection, nowMs) : 0;
  const noteSaved = visibleMarkerId != null && !selection && !importantMoment;
  const importantMomentSaved =
    noteSaved && state.last_note_marker?.kind === "important_moment";
  const visuallyCompact = compact;
  const shortcutBlocked =
    shortcutPermission === false &&
    state.phase === "recording" &&
    !selection &&
    !importantMoment &&
    !noteSaved;
  const shortcutWarningVisible = shortcutBlocked && !visuallyCompact;
  const progress = selection
    ? Math.min(100, (selectedMs / selection.max_duration_ms) * 100)
    : 0;
  const title = processing
    ? t({ id: "meeting.capture.summarizing", message: "Summarizing…" })
    : shortcutWarningVisible
      ? t({
          id: "meeting.capture.shortcut_unavailable",
          message: "Fn blocked",
        })
      : importantMoment
        ? t({
            id: "meeting.capture.important_moment",
            message: "Important moment",
          })
        : selection
          ? t({ id: "meeting.capture.note", message: "Marking moment" })
          : noteSaved
            ? importantMomentSaved
              ? t({
                  id: "meeting.capture.important_moment_saved",
                  message: "Important moment saved",
                })
              : t({
                  id: "meeting.capture.note_saved",
                  message: "Moment saved",
                })
            : voiceNote
              ? t({ id: "note.capture.rail_title", message: "Note" })
              : t({ id: "meeting.capture.rail_title", message: "Recording" });
  const captureAriaLabel = voiceNote
    ? t({ id: "note.capture.active", message: "Note recording" })
    : t({ id: "meeting.capture.active", message: "Meeting recording" });
  const recordingSignal = processing ? (
    <Sparkle size={16} weight="fill" className="animate-pulse text-white/70" />
  ) : shortcutWarningVisible ? (
    <Key size={16} weight="bold" className="text-amber-300" />
  ) : importantMoment ? (
    <BookmarkSimple size={16} weight="fill" className="text-red-400" />
  ) : selection ? (
    // Anillo que se llena: un solo glifo dice "marcando" y cuánto (spec Fn·A).
    <span
      aria-hidden="true"
      className="relative grid h-4 w-4 place-items-center"
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--color-error) ${progress}%, var(--ui-fn-ring-track) 0)`,
          WebkitMaskImage:
            "radial-gradient(farthest-side, transparent 55%, black 57%)",
          maskImage:
            "radial-gradient(farthest-side, transparent 55%, black 57%)",
        }}
      />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-error)]" />
    </span>
  ) : noteSaved ? (
    <CheckCircle
      size={16}
      weight="fill"
      className="text-[var(--color-success)]"
    />
  ) : (
    <RecordingSignal />
  );

  const signal = (
    <button
      ref={signalButtonRef}
      type="button"
      data-overlay-drag-handle
      aria-controls={TRANSCRIPT_PANEL_ID}
      aria-expanded={!visuallyCompact}
      aria-label={
        visuallyCompact
          ? t({
              id: "meeting.capture.pill.expand",
              message: "Expand recording pill",
            })
          : t({
              id: "meeting.capture.pill.collapse",
              message: "Collapse recording pill",
            })
      }
      onClick={toggleCompact}
      className={`grid place-items-center rounded-full transition-colors hover:bg-white/10 ${
        visuallyCompact ? "h-9 w-10" : "h-7 w-7"
      }`}
    >
      {recordingSignal}
    </button>
  );

  const previewSegment = state.live_transcript?.trim()
    ? {
        id: `preview-${meetingId}`,
        source: state.live_transcript.startsWith("you:")
          ? ("you" as const)
          : ("them" as const),
        text: state.live_transcript.replace(/^(you|them):\s*/i, ""),
        start_ms: Math.max(0, state.elapsed_seconds - 1) * 1_000,
        end_ms: state.elapsed_seconds * 1_000,
      }
    : null;
  const transcriptSegments =
    details?.live_transcript?.length || !previewSegment
      ? (details?.live_transcript ?? [])
      : [previewSegment];
  const transcriptPanel = transcriptVisible ? (
    <MeetingTranscriptPanel
      id={TRANSCRIPT_PANEL_ID}
      meetingId={meetingId}
      segments={transcriptSegments}
      pinned
      onMinimize={toggleCompact}
    />
  ) : null;

  const meetingInfoVisible = Boolean(
    selection || importantMoment || noteSaved || shortcutWarningVisible,
  );
  const compactCopy =
    meetingInfoVisible || processing
      ? title
      : formatDuration(state.elapsed_seconds);

  const pill = (
    <div
      onPointerDown={beginMeetingDrag}
      className={`relative z-10 flex justify-center ${visuallyCompact ? "w-[128px]" : "w-[260px]"}`}
    >
      <SignalRail
        dragTitle={t({ id: "meeting.capture.drag", message: "Drag to move" })}
        ariaLabel={captureAriaLabel}
        signal={signal}
        title={visuallyCompact ? null : title}
        progress={undefined}
        // Una captura dura minutos u horas: el cronómetro solo no dice qué se
        // está grabando, así que aquí el título se queda fijo en vez de esperar
        // al hover como en Dictation.
        meta={
          visuallyCompact || meetingInfoVisible || processing
            ? undefined
            : formatDuration(state.elapsed_seconds)
        }
        compactExtra={visuallyCompact ? compactCopy : undefined}
        infoVisible={!visuallyCompact}
        revealOnGroupInteraction={false}
        nativeDragRegions={false}
        actionsVisible={!visuallyCompact}
        className={
          visuallyCompact
            ? "!h-[36px] !w-[128px] !transition-colors hover:!w-[128px] focus-within:!w-[128px]"
            : "!w-[260px] !transition-colors hover:!w-[260px] focus-within:!w-[260px]"
        }
        actions={
          processing ? null : shortcutWarningVisible ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void openShortcutPermissionHelp().catch((error) =>
                    console.error("Failed to open the Fn help:", error),
                  );
                }}
                className="inline-flex h-7 shrink-0 items-center rounded-[9px] border border-amber-300/25 bg-amber-300/10 px-2 text-[10px] font-semibold text-amber-100 transition-colors duration-150 hover:bg-amber-300/20"
              >
                {t({
                  id: "meeting.capture.shortcut_enable",
                  message: "Why?",
                })}
              </button>
              <button
                type="button"
                title={t({ id: "meeting.capture.stop", message: "Stop" })}
                aria-label={t({
                  id: "meeting.capture.stop",
                  message: "Stop",
                })}
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 text-white/65 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500 hover:text-white disabled:opacity-50"
              >
                <Stop size={10} weight="fill" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => stop.mutate()}
              disabled={stop.isPending || state.phase === "finalizing"}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[9px] border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-white/75 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500 hover:text-white disabled:opacity-50"
            >
              <Stop size={10} weight="fill" />
              {state.phase === "finalizing"
                ? t({ id: "meeting.capture.saving", message: "Saving..." })
                : t({ id: "meeting.capture.stop", message: "Stop" })}
            </button>
          )
        }
      />
    </div>
  );

  return (
    <div
      className={`relative flex h-full w-full select-none justify-end gap-1 p-1 ${
        placement === "above"
          ? "flex-col items-center"
          : `flex-row ${sideAlignment === "top" ? "items-start" : "items-end"}`
      }`}
    >
      {visuallyCompact ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="meeting-compact-hit-slop"
          onClick={toggleCompact}
          className="absolute inset-0 rounded-[22px]"
        />
      ) : null}
      {placement === "above" ? (
        <>
          {transcriptPanel}
          {pill}
        </>
      ) : placement === "left" ? (
        <>
          {transcriptPanel}
          {pill}
        </>
      ) : (
        <>
          {pill}
          {transcriptPanel}
        </>
      )}
    </div>
  );
};

export default MeetingCaptureOverlay;
