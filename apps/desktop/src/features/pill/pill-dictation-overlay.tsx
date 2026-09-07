import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowCounterClockwise,
  Check,
  Copy,
  Waveform,
  X,
} from "@phosphor-icons/react";
import React, { useRef, useEffect, useMemo, useState } from "react";
import { finishRecording } from "../../data/capture/audio";
import {
  cancelPendingInsertion,
  chooseEditAction,
  confirmPendingInsertion,
  getActiveModeRuleSuggestion,
  undoLastInsertion,
} from "../../data/capture/insertion";
import { setPillHitSize } from "../../data/capture/overlay";
import { retryTranscription } from "../../data/transcription";
import { usePillState } from "./usePillState";
import {
  EDIT_ACTIONS,
  TRANSFORM_PRESETS,
  type TransformPreset,
} from "../../contracts";
import { useCopyToClipboard } from "../../shared/hooks/useCopyToClipboard";
import { useMountEffect } from "../../shared/hooks/useMountEffect";
import { SIGNAL_RAIL_SHELL_CLASS, SignalRailContent } from "./SignalRail";
import { CapturePreflight } from "./pill-preflight";
import { buildAnimatedTextTokens } from "./pill-expanded-text-model";
import { useOverlayDrag } from "./use-overlay-drag";
import { usePillInteractions } from "./use-pill-interactions";
import {
  measureResultCard,
  PILL_EXPANDED_WIDTH,
  resolvePillShellGeometry,
} from "./pill-shell-model";
import { usePillVisualizer } from "./use-pill-visualizer";

/* ───────────────────────── Constants ───────────────────────── */

const COMPACT_SIGNAL_WIDTH = 32;
const COMPACT_SIGNAL_HEIGHT = 18;
const tenPixelTextClass = `text-[${10}px]`;
const elevenPixelTextClass = `text-[${11}px]`;

const RESULT_AUTO_DISMISS_MS = 10_000;
const EXPANDED_TEXT_TOP_FADE = "var(--ui-pill-expanded-text-mask)";
const PILL_STATUS_COPY = {
  listening: { id: "pill.status.listening", message: "Listening..." },
  processing: { id: "pill.status.processing", message: "Processing..." },
  cancelled: { id: "pill.status.cancelled", message: "Discarded" },
  error: { id: "pill.status.error", message: "Error occurred" },
} as const;

function CopyResultAutoDismiss() {
  useMountEffect(() => {
    const timeout = window.setTimeout(() => {
      cancelPendingInsertion().catch((error) => {
        console.error("Failed to auto-dismiss transcription result:", error);
      });
    }, RESULT_AUTO_DISMISS_MS);

    return () => window.clearTimeout(timeout);
  });

  return null;
}

/* ───────────────────────── Component ───────────────────────── */

interface PillOverlayProps {
  className?: string;
  style?: React.CSSProperties;
  sensitivity?: number;
  decay?: number;
}

const DictationPillOverlay: React.FC<PillOverlayProps> = ({
  className = "",
  style = {},
  sensitivity = 3,
  decay = 0.85,
}) => {
  const { t } = useLingui();
  const {
    retryId,
    inserted,
    dismissInserted,
    pillStatus,
    spectrumBinsRef,
    lastSpectrumAtRef,
    isErrorFlashing,
    isExpanded,
    expandedText,
    pillTone,
    usedScreenContext,
    isHovered,
    dismiss,
  } = usePillState();
  const drag = useOverlayDrag();
  const isPreviewPending = isExpanded && pillTone === "preview";
  const [isPreviewEditing, setIsPreviewEditing] = useState(false);
  const [previewDraft, setPreviewDraft] = useState("");

  useEffect(() => {
    if (!isPreviewPending) {
      setIsPreviewEditing(false);
      return;
    }
    setPreviewDraft(expandedText);
  }, [isPreviewPending, expandedText]);

  // Selection Mode's action selector (F2): shown post-transcription, before
  // the transform runs (see transcribe.rs::await_edit_action_selection).
  const isActionSelectPending = isExpanded && pillTone === "action_select";
  // Selection Mode's "Ask" result (F2): shown-only, dismissing it (any key/
  // click) never inserts - see transcribe.rs::await_ask_result_dismissal.
  const isAskResultPending = isExpanded && pillTone === "ask_result";
  const isCopyResultPending = isExpanded && pillTone === "copy_result";
  const isInsertedResultPending = isExpanded && pillTone === "inserted_result";
  // A result card is a window the user can push out of the way.
  const isResultDraggable =
    isCopyResultPending || isAskResultPending || isInsertedResultPending;
  const isResultCard =
    isPreviewPending ||
    isAskResultPending ||
    isCopyResultPending ||
    isInsertedResultPending;
  const resultCardLayout = measureResultCard(expandedText);
  const { copied, copy } = useCopyToClipboard();
  const [selectedPreset, setSelectedPreset] = useState<
    TransformPreset | undefined
  >(undefined);

  useEffect(() => {
    if (!isActionSelectPending) {
      setSelectedPreset(undefined);
      return;
    }

    // Smart Modes (F5): pre-select the matching rule's preset as a default -
    // the buttons below still let the user pick a different one before
    // choosing an action, this only sets the initial selection.
    let cancelled = false;
    getActiveModeRuleSuggestion()
      .then((suggestion) => {
        if (!cancelled && suggestion?.transformPreset) {
          setSelectedPreset(suggestion.transformPreset);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch Smart Mode suggestion:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [isActionSelectPending]);

  const prevSegmentKeysRef = useRef<Set<number>>(new Set());
  const expandedTextSegments = useMemo(
    () =>
      expandedText
        ? buildAnimatedTextTokens(expandedText, prevSegmentKeysRef.current)
        : [],
    [expandedText],
  );
  useEffect(() => {
    prevSegmentKeysRef.current = new Set(
      expandedTextSegments.map((s) => s.key),
    );
  }, [expandedTextSegments]);

  const { canvasRef, containerRef, bgCanvasRef, bgContainerRef } =
    usePillVisualizer({
      status: pillStatus,
      expanded: isExpanded,
      errorFlashing: isErrorFlashing,
      spectrum: spectrumBinsRef,
      lastSpectrumAt: lastSpectrumAtRef,
      sensitivity,
      decay,
    });
  const { listeningTimer, cancelCurrentRecording } = usePillInteractions({
    status: pillStatus,
    dismiss,
    previewPending: isPreviewPending,
    previewEditing: isPreviewEditing,
    previewDraft,
    expandedText,
    askResultPending: isAskResultPending,
    copyResultPending: isCopyResultPending,
    insertedResultPending: isInsertedResultPending,
    actionSelectPending: isActionSelectPending,
    selectedPreset,
  });

  /* ───────────────────────── Render ───────────────────────── */

  const statusCopy =
    PILL_STATUS_COPY[pillStatus as keyof typeof PILL_STATUS_COPY];

  const shell = resolvePillShellGeometry({
    expanded: isExpanded,
    hovered: isHovered,
    inserted: inserted !== null,
    retryAvailable: retryId !== null,
    resultCard: isResultCard,
    resultHeight: resultCardLayout.height,
    actionSelect: isActionSelectPending,
    status: pillStatus,
  });
  // La zona clicable nativa se calculaba con constantes que no seguían al
  // shell: sobraba área encima de la píldora expandida y faltaban unos puntos
  // arriba del rail. Ahora la reporta quien la dibuja.
  useEffect(() => {
    void setPillHitSize(shell.width, shell.height).catch((error) =>
      console.error("Failed to report pill hit size:", error),
    );
  }, [shell.width, shell.height]);

  const expandedContentTransition = isExpanded
    ? "opacity 0.18s ease-out 0.04s"
    : "opacity 0.1s ease-in";
  const topFadeTransition = isExpanded ? "opacity 0.2s ease" : "none";
  const bgOpacityTransition = isExpanded ? "opacity 0.32s ease 0.08s" : "none";

  if (pillStatus === "preflight") {
    return <CapturePreflight />;
  }

  if (pillStatus === "idle" && !inserted) {
    return <CapturePreflight sticky isHovered={isHovered} />;
  }

  return (
    <div
      className={`relative w-full h-full flex flex-col justify-end select-none ${className}`}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {statusCopy ? t(statusCopy) : ""}
      </div>
      <div className="relative flex flex-col items-center pb-2">
        <AnimatePresence initial={false}>
          {(pillStatus !== "idle" || inserted) && (
            <motion.div
              onPointerDown={isResultDraggable ? drag.onPointerDown : undefined}
              onClickCapture={
                isResultDraggable ? drag.onClickCapture : undefined
              }
              className={`${SIGNAL_RAIL_SHELL_CLASS} flex-col ${pillTone === "cleanup" ? "pill-shell-cleanup" : ""} ${isErrorFlashing ? "animate-shake" : ""}`}
              initial={false}
              animate={{
                opacity: 1,
                scaleX: 1,
                scaleY: 1,
                y: 0,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                scaleX: 0.74,
                scaleY: 0.92,
                y: 5,
                filter: "blur(4px)",
                transition: {
                  type: "spring",
                  stiffness: 820,
                  damping: 34,
                  mass: 0.34,
                  filter: { duration: 0.12, ease: "easeIn" },
                  opacity: { duration: 0.12, ease: "easeIn" },
                },
              }}
              style={{
                width: shell.width,
                height: shell.height,
                borderRadius: shell.radius,
                backgroundColor: "var(--ui-pill-shell-bg)",
                borderColor: "var(--ui-pill-shell-border)",
                boxShadow: "var(--ui-pill-shell-shadow)",
                transformOrigin: "bottom center",
              }}
            >
              <div aria-hidden="true" className="pill-cleanup-field" />

              {(isCopyResultPending || isInsertedResultPending) && (
                <CopyResultAutoDismiss key={expandedText} />
              )}

              <div
                className="pill-expanded-content relative z-10"
                style={{
                  flex: isExpanded ? 1 : 0,
                  opacity: isExpanded ? 1 : 0,
                  overflow: "hidden",
                  minHeight: 0,
                  transition: expandedContentTransition,
                }}
              >
                <div
                  className="h-full w-full flex flex-col"
                  style={{
                    padding: isExpanded ? "14px 16px 14px" : "0 16px",
                    position: "relative",
                  }}
                >
                  {isResultCard && (
                    <div className="relative z-30 flex h-6 shrink-0 items-center justify-between">
                      <div className="flex min-w-0 items-center gap-1.5 text-white/45">
                        <Waveform size={12} weight="bold" />
                        <span
                          className={`truncate ${tenPixelTextClass} leading-none`}
                        >
                          {isCopyResultPending
                            ? t({
                                id: "pill.result.no_textbox_hint",
                                message: "Select a textbox first, or copy",
                              })
                            : isInsertedResultPending
                              ? t({
                                  id: "pill.result.inserted_hint",
                                  message: "Inserted",
                                })
                              : isPreviewPending
                                ? t({
                                    id: "pill.result.review_hint",
                                    message: "Review, then insert or copy",
                                  })
                                : t({
                                    id: "pill.result.copy_hint",
                                    message: "Result ready to copy",
                                  })}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={t({
                          id: "pill.result.close",
                          message: "Close result",
                        })}
                        onClick={() => {
                          cancelPendingInsertion().catch((err) => {
                            console.error("Failed to close result:", err);
                          });
                        }}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white/80 active:scale-[0.97]"
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute left-0 right-0 top-0 pointer-events-none z-20"
                    style={{
                      height: 30,
                      background: EXPANDED_TEXT_TOP_FADE,
                      opacity: isExpanded ? 1 : 0,
                      transition: topFadeTransition,
                    }}
                  />

                  <div
                    className={`flex-1 w-full flex flex-col relative z-10 ${
                      isResultCard
                        ? resultCardLayout.scrollable
                          ? "overflow-y-auto custom-scrollbar-thin justify-start"
                          : "overflow-hidden justify-center"
                        : "overflow-hidden justify-end"
                    }`}
                  >
                    <motion.div
                      layout={isHovered ? false : "position"}
                      className={`w-full flex flex-col ${
                        isResultCard && resultCardLayout.scrollable
                          ? "justify-start"
                          : "justify-end"
                      }`}
                    >
                      {usedScreenContext &&
                        (isPreviewPending || isAskResultPending) && (
                          <span
                            style={{
                              alignSelf: "center",
                              marginBottom: 6,
                              fontSize: 10,
                              lineHeight: 1,
                              padding: "3px 7px",
                              borderRadius: 999,
                              border:
                                "1px solid var(--color-pill-control-border)",
                              background: "var(--surface-pill-control-muted)",
                              color: "var(--color-pill-control-text)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t({
                              id: "pill.screen_context.used",
                              message: "Screen context",
                            })}
                          </span>
                        )}
                      {isPreviewPending && isPreviewEditing ? (
                        <textarea
                          autoFocus
                          rows={3}
                          value={previewDraft}
                          onChange={(e) => setPreviewDraft(e.target.value)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={t({
                            id: "pill.preview.edit_aria",
                            message: "Edit transcript before inserting",
                          })}
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            lineHeight: "1.5",
                            fontFamily: "var(--font-ui)",
                            color: "var(--color-pill-preview-text)",
                            fontWeight: 400,
                            letterSpacing: "-0.01em",
                            textAlign: "center",
                            width: "100%",
                            wordBreak: "break-word",
                            resize: "none",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                          }}
                        />
                      ) : (
                        <p
                          onClick={() => {
                            if (isPreviewPending) {
                              setIsPreviewEditing(true);
                              return;
                            }
                            if (isAskResultPending) {
                              // Dismiss only - never inserts, see the
                              // keydown handler above for why any
                              // resolution of this gate is safe.
                              cancelPendingInsertion().catch((err) => {
                                console.error(
                                  "Failed to dismiss ask result:",
                                  err,
                                );
                              });
                            }
                          }}
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            lineHeight: "1.5",
                            fontFamily: "var(--font-ui)",
                            color: "var(--color-pill-preview-text)",
                            fontWeight: 400,
                            letterSpacing: "-0.01em",
                            textAlign: "center",
                            width: "100%",
                            wordBreak: "break-word",
                            cursor: isPreviewPending
                              ? "text"
                              : isAskResultPending
                                ? "pointer"
                                : "default",
                          }}
                        >
                          {expandedTextSegments.map(
                            ({ key, text, isWhitespace, delay }) => {
                              if (isWhitespace) {
                                return (
                                  <motion.span
                                    key={key}
                                    layout={isHovered ? false : "position"}
                                    transition={{
                                      layout: {
                                        type: "spring",
                                        bounce: 0,
                                        duration: 0.24,
                                      },
                                    }}
                                    style={{
                                      display: "inline-block",
                                      whiteSpace: "pre",
                                    }}
                                  >
                                    {text}
                                  </motion.span>
                                );
                              }
                              return (
                                <motion.span
                                  key={key}
                                  layout={isHovered ? false : "position"}
                                  initial={
                                    isHovered
                                      ? { opacity: 0, y: 4 }
                                      : {
                                          opacity: 0,
                                          filter: "blur(2px)",
                                          y: 4,
                                        }
                                  }
                                  animate={{
                                    opacity: 1,
                                    filter: "blur(0px)",
                                    y: 0,
                                  }}
                                  transition={
                                    isHovered
                                      ? {
                                          opacity: {
                                            duration: 0.2,
                                            ease: "easeOut",
                                            delay,
                                          },
                                          filter: {
                                            duration: 0.18,
                                            ease: "easeOut",
                                          },
                                          y: {
                                            duration: 0.2,
                                            ease: "easeOut",
                                            delay,
                                          },
                                        }
                                      : {
                                          opacity: {
                                            duration: 0.2,
                                            ease: "easeOut",
                                            delay,
                                          },
                                          filter: {
                                            duration: 0.18,
                                            ease: "easeOut",
                                            delay,
                                          },
                                          y: {
                                            duration: 0.2,
                                            ease: "easeOut",
                                            delay,
                                          },
                                          layout: {
                                            type: "spring",
                                            bounce: 0,
                                            duration: 0.24,
                                          },
                                        }
                                  }
                                  style={{
                                    display: "inline-block",
                                    willChange: isHovered
                                      ? "transform, opacity"
                                      : "transform, opacity, filter",
                                  }}
                                >
                                  {text}
                                </motion.span>
                              );
                            },
                          )}
                        </p>
                      )}
                    </motion.div>
                  </div>

                  {isResultCard && (
                    <div className="relative z-30 mt-2 flex shrink-0 items-center justify-end gap-1.5">
                      {isInsertedResultPending && (
                        <button
                          type="button"
                          onClick={() => {
                            undoLastInsertion().catch((err) => {
                              console.error("Failed to undo insertion:", err);
                            });
                            cancelPendingInsertion().catch((err) => {
                              console.error("Failed to close result:", err);
                            });
                          }}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/12 bg-white/6 px-2.5 ${elevenPixelTextClass} font-medium text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.97]`}
                        >
                          <ArrowCounterClockwise size={12} weight="bold" />
                          {t({ id: "pill.result.undo", message: "Undo" })}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          copy(isPreviewEditing ? previewDraft : expandedText)
                        }
                        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/12 bg-white/6 px-2.5 ${elevenPixelTextClass} font-medium text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.97]`}
                      >
                        {copied ? (
                          <Check size={12} weight="bold" />
                        ) : (
                          <Copy size={12} weight="bold" />
                        )}
                        {copied
                          ? t({ id: "pill.result.copied", message: "Copied" })
                          : t({ id: "pill.result.copy", message: "Copy" })}
                      </button>
                      {isPreviewPending && (
                        <button
                          type="button"
                          onClick={() => {
                            const text = isPreviewEditing
                              ? previewDraft
                              : expandedText;
                            confirmPendingInsertion(text).catch((err) => {
                              console.error(
                                "Failed to insert transcription:",
                                err,
                              );
                            });
                          }}
                          className={`inline-flex h-7 items-center rounded-lg bg-white/85 px-2.5 ${elevenPixelTextClass} font-semibold text-black hover:bg-white active:scale-[0.97]`}
                        >
                          {t({ id: "pill.result.insert", message: "Insert" })}
                        </button>
                      )}
                    </div>
                  )}

                  {isActionSelectPending && (
                    <div
                      className="w-full flex flex-col items-center gap-2 relative z-10"
                      style={{ paddingTop: 10 }}
                    >
                      <div className="w-full flex flex-wrap items-center justify-center gap-1.5">
                        {EDIT_ACTIONS.map(({ action, label, key }) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() =>
                              chooseEditAction(action, selectedPreset).catch(
                                (err) => {
                                  console.error(
                                    "Failed to choose edit action:",
                                    err,
                                  );
                                },
                              )
                            }
                            style={{
                              fontSize: 11,
                              lineHeight: 1,
                              padding: "5px 9px",
                              borderRadius: 999,
                              border:
                                action === "replace"
                                  ? "1px solid var(--color-pill-control-border-active)"
                                  : "1px solid var(--color-pill-control-border)",
                              background:
                                action === "replace"
                                  ? "var(--surface-pill-control-active)"
                                  : "var(--surface-pill-control)",
                              color: "var(--color-pill-preview-text)",
                              cursor: "pointer",
                            }}
                          >
                            {t(label)}{" "}
                            <span style={{ opacity: 0.45 }}>{key}</span>
                          </button>
                        ))}
                      </div>
                      <div className="w-full flex flex-wrap items-center justify-center gap-1">
                        {TRANSFORM_PRESETS.map(({ preset, label }) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setSelectedPreset((current) =>
                                current === preset ? undefined : preset,
                              )
                            }
                            style={{
                              fontSize: 10,
                              lineHeight: 1,
                              padding: "3px 7px",
                              borderRadius: 999,
                              border:
                                selectedPreset === preset
                                  ? "1px solid var(--color-pill-control-border-active)"
                                  : "1px solid transparent",
                              background:
                                selectedPreset === preset
                                  ? "var(--surface-pill-control-active)"
                                  : "transparent",
                              color: "var(--color-pill-control-text)",
                              cursor: "pointer",
                            }}
                          >
                            {t(label)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1]"
                style={{
                  opacity: isExpanded ? 0.08 : 0,
                  transition: bgOpacityTransition,
                }}
              >
                <div
                  ref={bgContainerRef}
                  className="relative overflow-hidden rounded-[inherit]"
                  style={{ width: PILL_EXPANDED_WIDTH, height: shell.height }}
                >
                  <canvas
                    ref={bgCanvasRef}
                    className="absolute inset-0 w-full h-full block"
                    role="img"
                    aria-label={t({
                      id: "pill.background_visualizer",
                      message: "Background audio visualizer",
                    })}
                  />
                </div>
              </div>

              {!isExpanded && (
                <div className="absolute inset-0 z-[2] flex items-center justify-center">
                  <SignalRailContent
                    revealOnGroupInteraction={false}
                    actionsVisible={
                      !isExpanded &&
                      (isHovered || Boolean(inserted) || Boolean(retryId))
                    }
                    compactExtra={
                      pillStatus === "listening"
                        ? listeningTimer
                        : pillStatus === "processing"
                          ? t({
                              id: "pill.rail.processing",
                              message: "Writing…",
                            })
                          : undefined
                    }
                    infoVisible={
                      isHovered ||
                      pillStatus === "error" ||
                      pillStatus === "cancelled" ||
                      Boolean(inserted)
                    }
                    signal={
                      <div
                        ref={containerRef}
                        data-tauri-drag-region
                        className="relative overflow-hidden rounded-full"
                        style={{
                          width: COMPACT_SIGNAL_WIDTH,
                          height: COMPACT_SIGNAL_HEIGHT,
                        }}
                      >
                        <canvas
                          ref={canvasRef}
                          className="absolute inset-0 block h-full w-full"
                          role="img"
                          aria-label={t({
                            id: "pill.visualizer",
                            message: "Audio visualizer",
                          })}
                        />
                      </div>
                    }
                    title={
                      inserted
                        ? t({ id: "pill.rail.inserted", message: "Inserted" })
                        : pillStatus === "listening"
                          ? t({
                              id: "pill.rail.listening",
                              message: "Listening",
                            })
                          : pillStatus === "processing"
                            ? t({
                                id: "pill.rail.processing",
                                message: "Writing…",
                              })
                            : pillStatus === "cancelled"
                              ? t({
                                  id: "pill.rail.cancelled",
                                  message: "Discarded",
                                })
                              : t({
                                  id: "pill.rail.error",
                                  message: "Couldn't transcribe",
                                })
                    }
                    meta={
                      inserted
                        ? t({
                            id: "pill.rail.inserted_hint",
                            message: `${inserted.chars} characters`,
                          })
                        : pillStatus === "listening"
                          ? `${listeningTimer} · ${t({
                              id: "pill.rail.finish_hint",
                              message: "Release Fn to transcribe",
                            })}`
                          : pillStatus === "processing"
                            ? t({
                                id: "pill.rail.processing_hint",
                                message: "Preparing your note",
                              })
                            : pillStatus === "cancelled"
                              ? t({
                                  id: "pill.rail.cancelled_hint",
                                  message: "Nothing inserted",
                                })
                              : t({
                                  id: "pill.rail.error_hint",
                                  message: "Audio saved in Home",
                                })
                    }
                    actions={
                      !isExpanded &&
                      (inserted ? (
                        inserted.canUndo ? (
                          <button
                            type="button"
                            onClick={() => {
                              void undoLastInsertion().catch(() => {});
                              dismissInserted();
                            }}
                            className="inline-flex h-7 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 px-2.5 ui-text-micro font-medium text-white/80 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-white active:scale-[0.96]"
                          >
                            {t({ id: "pill.rail.undo", message: "Undo" })}
                          </button>
                        ) : null
                      ) : pillStatus === "error" && retryId ? (
                        <button
                          type="button"
                          onClick={() => {
                            void retryTranscription(retryId).catch(() => {});
                            dismiss();
                          }}
                          className="inline-flex h-7 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 px-2.5 ui-text-micro font-medium text-white/80 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-white active:scale-[0.96]"
                        >
                          {t({ id: "pill.rail.retry", message: "Retry" })}
                        </button>
                      ) : pillStatus === "cancelled" ? null : (
                        <>
                          <button
                            type="button"
                            aria-label={t({
                              id: "pill.rail.cancel",
                              message: "Cancel recording",
                            })}
                            title={t({
                              id: "pill.rail.cancel",
                              message: "Cancel recording",
                            })}
                            onClick={() => void cancelCurrentRecording()}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 text-white/60 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-white active:scale-[0.96]"
                          >
                            <X size={13} weight="bold" />
                          </button>
                          {pillStatus === "listening" ? (
                            <button
                              type="button"
                              onClick={() => {
                                void finishRecording().catch((error) =>
                                  console.error(
                                    "Failed to finish recording:",
                                    error,
                                  ),
                                );
                              }}
                              className={`inline-flex h-7 items-center gap-1 rounded-[9px] border border-white/12 bg-white/85 px-2 ${tenPixelTextClass} font-semibold text-black transition-[background-color,transform] duration-150 hover:bg-white active:scale-[0.97]`}
                            >
                              <Check size={11} weight="bold" />
                              {t({ id: "pill.rail.done", message: "Done" })}
                            </button>
                          ) : null}
                        </>
                      ))
                    }
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export { DictationPillOverlay };
