import { useLingui } from "@lingui/react/macro";
import {
  BookmarkSimple,
  CheckCircle,
  Key,
  Sparkle,
  Stop,
  TextAlignLeft,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MeetingCaptureState } from "../../../types";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { SignalRail } from "../../pill/SignalRail";
import { useMeetingDetails, useStopMeetingCapture } from "../queries";
import {
  setMeetingOverlayPresentation,
  type MeetingTranscriptPlacement,
  type MeetingTranscriptSideAlignment,
} from "../../../data/overlay";
import {
  checkShortcutPermission,
  openShortcutPermissionHelp,
  retryShortcuts,
} from "../../../data/shortcuts";
import { formatDuration } from "./library-utils";
import { selectedDurationMs } from "./meeting-note-duration";
import { MeetingTranscriptPanel } from "./MeetingTranscriptPanel";

const NOTE_SAVED_VISIBLE_MS = 2_400;
const PERMISSION_NOTICE_VISIBLE_MS = 6_000;

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
  const [compact, setCompact] = useState(false);
  const [transcriptHovered, setTranscriptHovered] = useState(false);
  const [transcriptPinned, setTranscriptPinned] = useState(false);
  const [suppressHoverUntilLeave, setSuppressHoverUntilLeave] = useState(false);
  const [placement, setPlacement] =
    useState<MeetingTranscriptPlacement>("above");
  const [sideAlignment, setSideAlignment] =
    useState<MeetingTranscriptSideAlignment>("bottom");
  const [shortcutPermission, setShortcutPermission] = useState<boolean | null>(
    null,
  );
  const [permissionNoticeVisible, setPermissionNoticeVisible] = useState(false);
  const compactPointer = useRef<{
    x: number;
    y: number;
    dragged: boolean;
  } | null>(null);
  const suppressCompactClick = useRef(false);
  const permissionNoticeTimer = useRef<number | null>(null);

  const hidePermissionNotice = () => {
    if (permissionNoticeTimer.current != null) {
      window.clearTimeout(permissionNoticeTimer.current);
      permissionNoticeTimer.current = null;
    }
    setPermissionNoticeVisible(false);
  };

  const showPermissionNotice = () => {
    if (permissionNoticeTimer.current != null) {
      window.clearTimeout(permissionNoticeTimer.current);
    }
    setPermissionNoticeVisible(true);
    permissionNoticeTimer.current = window.setTimeout(() => {
      permissionNoticeTimer.current = null;
      setPermissionNoticeVisible(false);
    }, PERMISSION_NOTICE_VISIBLE_MS);
  };

  useMountEffect(() => {
    let cancelled = false;
    let shortcutWasReady = false;
    let reportedMissingPermission = false;
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
          hidePermissionNotice();
        } else if (!reportedMissingPermission) {
          reportedMissingPermission = true;
          showPermissionNotice();
        }
      } catch (error) {
        if (!cancelled) {
          shortcutWasReady = false;
          setShortcutPermission(false);
          if (!reportedMissingPermission) {
            reportedMissingPermission = true;
            showPermissionNotice();
          }
          console.error("Failed to verify meeting shortcut:", error);
        }
      }
    };

    void refreshShortcutPermission();
    pollTimer = window.setInterval(refreshShortcutPermission, 1_500);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (permissionNoticeTimer.current != null) {
        window.clearTimeout(permissionNoticeTimer.current);
        permissionNoticeTimer.current = null;
      }
    };
  });

  const transcriptVisible =
    !compact &&
    (transcriptPinned || (transcriptHovered && !suppressHoverUntilLeave));

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

  const showTranscriptPreview = () => {
    if (compact || suppressHoverUntilLeave) return;
    setTranscriptHovered(true);
    void applyOverlayPresentation({
      compact: false,
      transcriptVisible: true,
      transcriptPinned,
    });
  };

  const hideTranscriptPreview = () => {
    setSuppressHoverUntilLeave(false);
    if (transcriptPinned) return;
    void applyOverlayPresentation({
      compact: false,
      transcriptVisible: false,
      transcriptPinned: false,
    }).then(() => setTranscriptHovered(false));
  };

  const togglePinnedTranscript = () => {
    if (transcriptPinned) {
      setSuppressHoverUntilLeave(true);
      void applyOverlayPresentation({
        compact: false,
        transcriptVisible: false,
        transcriptPinned: false,
      }).then(() => {
        setTranscriptPinned(false);
        setTranscriptHovered(false);
        setSuppressHoverUntilLeave(false);
      });
      return;
    }

    setTranscriptPinned(true);
    setSuppressHoverUntilLeave(false);
    void applyOverlayPresentation({
      compact: false,
      transcriptVisible: true,
      transcriptPinned: true,
    });
  };

  const toggleCompact = () => {
    const nextCompact = !compact;
    hidePermissionNotice();
    setCompact(nextCompact);
    setTranscriptHovered(false);
    setTranscriptPinned(false);
    setSuppressHoverUntilLeave(false);
    void applyOverlayPresentation({
      compact: nextCompact,
      transcriptVisible: false,
      transcriptPinned: false,
    });
  };

  const beginCompactPointerGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!compact || event.button !== 0) return;
    compactPointer.current = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
    suppressCompactClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueCompactPointerGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const pointer = compactPointer.current;
    if (!compact || !pointer || pointer.dragged) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 4) {
      return;
    }

    pointer.dragged = true;
    suppressCompactClick.current = true;
    void getCurrentWindow()
      .startDragging()
      .catch((error) => console.error("Failed to drag meeting pill:", error));
  };

  const endCompactPointerGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    compactPointer.current = null;
  };

  const activateSignal = () => {
    if (compact && suppressCompactClick.current) {
      suppressCompactClick.current = false;
      return;
    }
    toggleCompact();
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
  const shortcutBlocked =
    shortcutPermission === false &&
    permissionNoticeVisible &&
    state.phase === "recording" &&
    !selection &&
    !importantMoment &&
    !noteSaved;
  const forceExpanded =
    shortcutBlocked || Boolean(selection || importantMoment || noteSaved);
  const visuallyCompact = compact && !forceExpanded;
  const progress = selection
    ? Math.min(100, (selectedMs / selection.max_duration_ms) * 100)
    : 0;
  const title = processing
    ? t({ id: "meeting.capture.summarizing", message: "Summarizing…" })
    : shortcutBlocked
      ? t({
          id: "meeting.capture.shortcut_unavailable",
          message: "macOS is blocking Fn",
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
  ) : shortcutBlocked ? (
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
      type="button"
      data-overlay-drag-handle
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
      onClick={activateSignal}
      onPointerDown={beginCompactPointerGesture}
      onPointerMove={continueCompactPointerGesture}
      onPointerUp={endCompactPointerGesture}
      onPointerCancel={endCompactPointerGesture}
      className={`grid place-items-center rounded-full transition-colors hover:bg-white/10 ${
        visuallyCompact
          ? "h-10 w-10 cursor-grab active:cursor-grabbing"
          : "h-7 w-7"
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
      meetingId={meetingId}
      segments={transcriptSegments}
      pinned={transcriptPinned}
      onMinimize={transcriptPinned ? togglePinnedTranscript : undefined}
    />
  ) : null;

  if (visuallyCompact) {
    return (
      <div className="relative flex h-full w-full select-none items-center justify-center">
        <section
          aria-label={captureAriaLabel}
          className="ui-pill-shell grid h-[42px] w-[42px] place-items-center rounded-full border border-[var(--ui-pill-shell-border)] text-white"
        >
          {signal}
        </section>
      </div>
    );
  }

  const meetingInfoVisible = Boolean(
    selection || importantMoment || noteSaved || shortcutBlocked,
  );

  const pill = (
    <div className="flex w-[260px] justify-center">
      <SignalRail
        dragTitle={t({ id: "meeting.capture.drag", message: "Drag to move" })}
        ariaLabel={captureAriaLabel}
        signal={signal}
        title={title}
        progress={undefined}
        // Una captura dura minutos u horas: el cronómetro solo no dice qué se
        // está grabando, así que aquí el título se queda fijo en vez de esperar
        // al hover como en Dictation.
        meta={
          meetingInfoVisible || processing
            ? undefined
            : formatDuration(state.elapsed_seconds)
        }
        infoVisible={meetingInfoVisible}
        actionsVisible={shortcutBlocked}
        className={
          meetingInfoVisible
            ? "!w-[260px]"
            : "!w-[150px] hover:!w-[260px] focus-within:!w-[260px]"
        }
        actions={
          processing ? null : shortcutBlocked ? (
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
            <>
              <button
                type="button"
                title={t({
                  id: "meeting.capture.transcript.toggle",
                  message: "Show or hide transcript",
                })}
                aria-label={t({
                  id: "meeting.capture.transcript.toggle",
                  message: "Show or hide transcript",
                })}
                aria-pressed={transcriptPinned}
                onMouseEnter={showTranscriptPreview}
                onMouseLeave={() => setSuppressHoverUntilLeave(false)}
                onClick={togglePinnedTranscript}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 text-white/65 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              >
                <TextAlignLeft size={14} weight="bold" />
              </button>

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
            </>
          )
        }
      />
    </div>
  );

  return (
    <div
      onMouseLeave={hideTranscriptPreview}
      className={`relative flex h-full w-full select-none justify-end gap-1 p-1 ${
        placement === "above"
          ? "flex-col items-center"
          : `flex-row ${sideAlignment === "top" ? "items-start" : "items-end"}`
      }`}
    >
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
