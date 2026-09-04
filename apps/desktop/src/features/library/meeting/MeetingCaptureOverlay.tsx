import { useLingui } from "@lingui/react/macro";
import {
  BookmarkSimple,
  CheckCircle,
  Key,
  Sparkle,
  Stop,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MeetingCaptureState } from "../../../contracts";
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
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { SIGNAL_RAIL_SHELL_CLASS } from "../../pill/SignalRail";
import { useOverlayDrag } from "../../pill/use-overlay-drag";
import { useMeetingDetails, useStopMeetingCapture } from "../queries";
import { formatDuration } from "../shared/library-utils";
import { selectedDurationMs } from "./meeting-note-duration";
import { MeetingTranscriptPanel } from "./MeetingTranscriptPanel";

const NOTE_SAVED_VISIBLE_MS = 2_400;
const HOVER_PREVIEW_DELAY_MS = 300;
const PERMISSION_NOTICE_VISIBLE_MS = 6_000;
const TRANSCRIPT_PANEL_ID = "meeting-live-transcript";

type TranscriptMode = "hidden" | "preview" | "pinned";

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

function DragGrip({
  onPointerDown,
}: {
  onPointerDown: ReturnType<typeof useOverlayDrag>["onPointerDown"];
}) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      data-overlay-drag-handle
      onPointerDown={onPointerDown}
      aria-label={t({
        id: "meeting.capture.drag",
        message: "Drag to move",
      })}
      className="grid h-10 w-10 shrink-0 cursor-grab place-items-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white/75 active:cursor-grabbing"
    >
      <span aria-hidden="true" className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className="h-0.5 w-0.5 rounded-full bg-current" />
        ))}
      </span>
    </button>
  );
}

const MeetingCaptureOverlay = ({ state }: { state: MeetingCaptureState }) => {
  const { t } = useLingui();
  const drag = useOverlayDrag();
  const stop = useStopMeetingCapture();
  const meetingId = state.id ?? "";
  const voiceNote = state.capture_intent === "voice_note";
  const processing = state.phase === "processing";
  const finalizing = state.phase === "finalizing";
  const { data: details } = useMeetingDetails(meetingId, meetingId.length > 0);
  const selection = state.active_note_selection ?? null;
  const importantMoment = state.active_important_moment ?? null;
  const markerId = state.last_note_marker?.id ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [visibleMarkerId, setVisibleMarkerId] = useState<string | null>(
    markerId,
  );
  const [transcriptMode, setTranscriptMode] =
    useState<TranscriptMode>("hidden");
  const [placement, setPlacement] =
    useState<MeetingTranscriptPlacement>("above");
  const [sideAlignment, setSideAlignment] =
    useState<MeetingTranscriptSideAlignment>("bottom");
  const [shortcutPermission, setShortcutPermission] = useState<boolean | null>(
    null,
  );
  const [permissionNoticeVisible, setPermissionNoticeVisible] =
    useState(false);
  const presentationRequestInFlight = useRef(false);
  const hoverPreviewTimer = useRef<number | null>(null);
  const permissionNoticeTimer = useRef<number | null>(null);
  const transcriptModeRef = useRef<TranscriptMode>("hidden");

  const clearHoverPreviewTimer = () => {
    if (hoverPreviewTimer.current == null) return;
    window.clearTimeout(hoverPreviewTimer.current);
    hoverPreviewTimer.current = null;
  };

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
    let missingPermissionWasReported = false;
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
        } else if (!missingPermissionWasReported) {
          missingPermissionWasReported = true;
          showPermissionNotice();
        }
      } catch (error) {
        if (cancelled) return;
        shortcutWasReady = false;
        setShortcutPermission(false);
        if (!missingPermissionWasReported) {
          missingPermissionWasReported = true;
          showPermissionNotice();
        }
        console.error("Failed to verify meeting shortcut:", error);
      }
    };

    void refreshShortcutPermission();
    pollTimer = window.setInterval(refreshShortcutPermission, 1_500);
    return () => {
      cancelled = true;
      clearHoverPreviewTimer();
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (permissionNoticeTimer.current != null) {
        window.clearTimeout(permissionNoticeTimer.current);
        permissionNoticeTimer.current = null;
      }
    };
  });

  const applyOverlayPresentation = async (
    next: Parameters<typeof setMeetingOverlayPresentation>[0],
  ) => {
    try {
      const result = await setMeetingOverlayPresentation(next);
      setPlacement(result.placement);
      setSideAlignment(result.sideAlignment);
      return true;
    } catch (error) {
      console.error("Failed to update meeting overlay presentation:", error);
      return false;
    }
  };

  const setTranscriptVisibility = async (next: TranscriptMode) => {
    if (presentationRequestInFlight.current) return;
    if (transcriptModeRef.current === next) return;
    presentationRequestInFlight.current = true;
    const previous = transcriptModeRef.current;
    // Al cerrar, React quita el panel antes de encoger la ventana nativa. De
    // otro modo el último frame del panel queda recortado durante el resize.
    if (next === "hidden") {
      transcriptModeRef.current = next;
      setTranscriptMode(next);
    }
    const applied = await applyOverlayPresentation({
      compact: next !== "pinned",
      transcriptVisible: next !== "hidden",
      transcriptPinned: next === "pinned",
    });
    if (applied) {
      transcriptModeRef.current = next;
      setTranscriptMode(next);
    } else if (next === "hidden") {
      transcriptModeRef.current = previous;
      setTranscriptMode(previous);
    }
    presentationRequestInFlight.current = false;
  };

  const scheduleTranscriptPreview = () => {
    if (transcriptModeRef.current !== "hidden") return;
    clearHoverPreviewTimer();
    hoverPreviewTimer.current = window.setTimeout(() => {
      hoverPreviewTimer.current = null;
      void setTranscriptVisibility("preview");
    }, HOVER_PREVIEW_DELAY_MS);
  };

  const hideTranscriptPreview = () => {
    clearHoverPreviewTimer();
    if (transcriptModeRef.current === "preview") {
      void setTranscriptVisibility("hidden");
    }
  };

  const togglePinnedTranscript = () => {
    clearHoverPreviewTimer();
    void setTranscriptVisibility(
      transcriptModeRef.current === "pinned" ? "hidden" : "pinned",
    );
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
  const progress = selection
    ? Math.min(100, (selectedMs / selection.max_duration_ms) * 100)
    : 0;
  const captureLabel = voiceNote
    ? t({ id: "note.capture.rail_title", message: "Note" })
    : t({ id: "meeting.capture.label", message: "Meeting" });
  const captureAriaLabel = voiceNote
    ? t({ id: "note.capture.active", message: "Note recording" })
    : t({ id: "meeting.capture.active", message: "Meeting recording" });
  const statusLabel = processing
    ? t({ id: "meeting.capture.summarizing", message: "Summarizing…" })
    : finalizing
      ? t({ id: "meeting.capture.finalizing", message: "Finishing…" })
      : state.phase === "starting"
        ? t({ id: "meeting.capture.starting", message: "Starting…" })
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
              : null;
  const recordingSignal = processing || finalizing ? (
    <Sparkle size={15} weight="fill" className="animate-pulse text-white/70" />
  ) : importantMoment ? (
    <BookmarkSimple size={15} weight="fill" className="text-red-400" />
  ) : selection ? (
    <span aria-hidden="true" className="relative grid h-4 w-4 place-items-center">
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
      size={15}
      weight="fill"
      className="text-[var(--color-success)]"
    />
  ) : (
    <RecordingSignal />
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
  const transcriptVisible = transcriptMode !== "hidden";
  const transientPermissionWarning =
    shortcutPermission === false && permissionNoticeVisible && !statusLabel;

  const transcriptPanel = transcriptVisible ? (
    <div
      onPointerEnter={clearHoverPreviewTimer}
      onPointerLeave={hideTranscriptPreview}
      onPointerDown={() => {
        if (transcriptModeRef.current === "preview") {
          void setTranscriptVisibility("pinned");
        }
      }}
    >
      <MeetingTranscriptPanel
        id={TRANSCRIPT_PANEL_ID}
        meetingId={meetingId}
        segments={transcriptSegments}
        pinned={transcriptMode === "pinned"}
        onMinimize={
          transcriptMode === "pinned" ? togglePinnedTranscript : undefined
        }
      />
    </div>
  ) : null;

  const pill = (
    <section
      aria-label={captureAriaLabel}
      className={`${SIGNAL_RAIL_SHELL_CLASS} flex h-11 w-[244px] items-center rounded-full px-1 text-white transition-[border-color,box-shadow] duration-150`}
      onPointerEnter={scheduleTranscriptPreview}
      onPointerLeave={hideTranscriptPreview}
      onClickCapture={drag.onClickCapture}
    >
      <DragGrip onPointerDown={drag.onPointerDown} />
      <button
        type="button"
        aria-controls={TRANSCRIPT_PANEL_ID}
        aria-expanded={transcriptMode === "pinned"}
        aria-label={
          transcriptMode === "pinned"
            ? t({
                id: "meeting.capture.pill.collapse",
                message: "Collapse recording pill",
              })
            : t({
                id: "meeting.capture.pill.expand",
                message: "Expand recording pill",
              })
        }
        onClick={togglePinnedTranscript}
        className="grid h-9 w-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/10"
      >
        {recordingSignal}
      </button>
      <div className="min-w-0 flex-1 pl-1">
        <p className="truncate text-[12px] font-semibold leading-4 text-white">
          {captureLabel}
        </p>
        <p className="truncate text-[10px] leading-3 text-white/60 tabular-nums">
          {statusLabel ?? formatDuration(state.elapsed_seconds)}
        </p>
      </div>
      {transientPermissionWarning ? (
        <button
          type="button"
          onClick={() => {
            hidePermissionNotice();
            void openShortcutPermissionHelp().catch((error) =>
              console.error("Failed to open the Fn help:", error),
            );
          }}
          className="mr-1 inline-flex h-8 shrink-0 items-center rounded-[9px] border border-amber-300/25 bg-amber-300/10 px-1.5 text-[9px] font-semibold text-amber-100 hover:bg-amber-300/20"
        >
          <Key size={11} weight="bold" className="mr-1" />
          {t({ id: "meeting.capture.shortcut_enable", message: "Fix Fn" })}
        </button>
      ) : processing || finalizing || state.phase === "starting" ? (
        <span className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-white/45">
          <Sparkle size={13} className="animate-pulse" />
        </span>
      ) : (
        <button
          type="button"
          title={t({ id: "meeting.capture.stop", message: "Stop" })}
          aria-label={t({ id: "meeting.capture.stop", message: "Stop" })}
          onClick={() => stop.mutate()}
          disabled={stop.isPending}
          className="mr-1 inline-flex h-8 min-w-11 shrink-0 items-center justify-center gap-1 rounded-[9px] border border-white/10 bg-white/5 px-2 text-[10px] font-semibold text-white/80 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500 hover:text-white disabled:opacity-50"
        >
          <Stop size={10} weight="fill" />
          {t({ id: "meeting.capture.stop", message: "Stop" })}
        </button>
      )}
    </section>
  );

  return (
    <div
      className={`relative flex h-full w-full select-none justify-end gap-1 p-1 ${
        placement === "above"
          ? "flex-col items-center"
          : `flex-row ${sideAlignment === "top" ? "items-start" : "items-end"}`
      }`}
    >
      {placement === "above" || placement === "left" ? (
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
