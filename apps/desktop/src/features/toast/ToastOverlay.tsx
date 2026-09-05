import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "@phosphor-icons/react";
import React, { useEffect, useRef, useState } from "react";
import { subscribeRecordingStart } from "../../data/capture/audio";
import { undoLastInsertion } from "../../data/capture/insertion";
import { retryTranscription } from "../../data/transcription";
import {
  hideToastWindow,
  notifyToastRendererReady,
  runToastAction,
  setToastInteractive,
  subscribeToastHide,
  subscribeToastShow,
} from "../../data/capture/toast";
import { useCopyToClipboard } from "../../shared/hooks/useCopyToClipboard";
import { useMountEffect } from "../../shared/hooks/useMountEffect";
import DotMatrix from "../../shared/ui/DotMatrix";
import type { ToastPayload, ToastType } from "../../contracts";

const MAX_VISIBLE_TOASTS = 1;
const RESUME_DISMISS_MS = 2_500;
const LEAVE_ANIMATION_MS = 120;

interface ToastState extends ToastPayload {
  id: number;
  isLeaving: boolean;
  autoDismissEnabled: boolean;
}

function ToastInteractivity({ interactive }: { interactive: boolean }) {
  useMountEffect(() => {
    setToastInteractive(interactive).catch((error) => {
      console.error("Failed to update toast interactivity:", error);
    });
    return () => {
      if (!interactive) return;
      setToastInteractive(false).catch((error) => {
        console.error("Failed to clear toast interactivity:", error);
      });
    };
  });
  return null;
}

const COLORS: Record<ToastType, { border: string; dot: string }> = {
  error: { border: "border-red-500/40", dot: "bg-red-500" },
  info: { border: "border-blue-500/30", dot: "bg-blue-400" },
  success: { border: "border-emerald-500/30", dot: "bg-emerald-400" },
  warning: { border: "border-amber-500/40", dot: "bg-amber-400" },
  update: { border: "border-violet-500/40", dot: "bg-violet-400" },
  celebration: { border: "border-amber-500/30", dot: "bg-amber-400" },
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  error: 18_000,
  info: 3_000,
  success: 2_000,
  warning: 5_000,
  update: 0,
  celebration: 6_000,
};

const TwinklingGrid = React.memo(
  ({ variant = "cloud" }: { variant?: "cloud" | "accent" }) => {
    const color =
      variant === "accent" ? "var(--color-accent)" : "var(--color-cloud)";
    const animationName = variant === "accent" ? "twinkle-accent" : "twinkle";
    const dots = React.useMemo(() => {
      const items = [];
      for (let row = 0; row < 12; row += 1) {
        for (let column = 0; column < 50; column += 1) {
          if (Math.random() > 0.4) continue;
          items.push(
            <div
              key={`${row}-${column}`}
              className="absolute size-0.5 rounded-full"
              style={{
                left: column * 8,
                top: row * 8,
                backgroundColor: color,
                opacity: 0.15,
                animation: `${animationName} ${2 + Math.random() * 4}s ease-in-out infinite`,
                animationDelay: `-${Math.random() * 5}s`,
              }}
            />,
          );
        }
      }
      return items;
    }, [animationName, color]);
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
        {dots}
      </div>
    );
  },
);

const ToastOverlay: React.FC = () => {
  const { t } = useLingui();
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const { copied, copy, reset: resetCopied } = useCopyToClipboard(1500);
  const nextIdRef = useRef(0);
  const toastsRef = useRef<ToastState[]>([]);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const leaveTimersRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const pendingToastsRef = useRef<ToastState[]>([]);
  const overflowTransitionRef = useRef(false);

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const clearTimer = (id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
  };

  const hideWindowIfEmpty = async () => {
    if (toastsRef.current.length > 0) return;
    try {
      await hideToastWindow();
    } catch (error) {
      console.error("Failed to hide toast window:", error);
    }
  };

  const removeImmediately = (id: number) => {
    clearTimer(id);
    const leaveTimer = leaveTimersRef.current.get(id);
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimersRef.current.delete(id);
    const next = toastsRef.current.filter((toast) => toast.id !== id);
    toastsRef.current = next;
    setToasts(next);
  };

  const dismiss = (id: number) => {
    if (leaveTimersRef.current.has(id)) return;
    clearTimer(id);
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, isLeaving: true } : toast,
      ),
    );
    const leaveTimer = setTimeout(() => {
      leaveTimersRef.current.delete(id);
      removeImmediately(id);
      resetCopied();
      void hideWindowIfEmpty();
    }, LEAVE_ANIMATION_MS);
    leaveTimersRef.current.set(id, leaveTimer);
  };

  const scheduleDismiss = (id: number, duration: number) => {
    clearTimer(id);
    timersRef.current.set(
      id,
      setTimeout(() => dismiss(id), duration),
    );
  };

  const appendNextToast = () => {
    if (overflowTransitionRef.current) return;
    const nextToast = pendingToastsRef.current.shift();
    if (!nextToast) return;

    const current = toastsRef.current;
    if (current.length < MAX_VISIBLE_TOASTS) {
      const next = [...current, nextToast];
      toastsRef.current = next;
      setToasts(next);
      if (nextToast.autoDismissEnabled) {
        scheduleDismiss(
          nextToast.id,
          nextToast.duration ?? DEFAULT_DURATIONS[nextToast.type],
        );
      }
      appendNextToast();
      return;
    }

    const oldest = current[0];
    overflowTransitionRef.current = true;
    clearTimer(oldest.id);
    const leaving = current.map((toast) =>
      toast.id === oldest.id ? { ...toast, isLeaving: true } : toast,
    );
    toastsRef.current = leaving;
    setToasts(leaving);
    leaveTimersRef.current.set(
      oldest.id,
      setTimeout(() => {
        leaveTimersRef.current.delete(oldest.id);
        const withoutOldest = toastsRef.current.filter(
          (toast) => toast.id !== oldest.id,
        );
        const next = [...withoutOldest, nextToast];
        toastsRef.current = next;
        setToasts(next);
        overflowTransitionRef.current = false;
        if (nextToast.autoDismissEnabled) {
          scheduleDismiss(
            nextToast.id,
            nextToast.duration ?? DEFAULT_DURATIONS[nextToast.type],
          );
        }
        appendNextToast();
      }, LEAVE_ANIMATION_MS),
    );
  };

  const closeAll = async () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    for (const timer of leaveTimersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    leaveTimersRef.current.clear();
    pendingToastsRef.current = [];
    overflowTransitionRef.current = false;
    toastsRef.current = [];
    setToasts([]);
    resetCopied();
    await hideWindowIfEmpty();
  };

  const handleToastAction = async (toast: ToastState, action: string) => {
    try {
      if (action === "undo_last_insertion") {
        await undoLastInsertion();
        dismiss(toast.id);
        return;
      }
      const args =
        toast.retryId &&
        (action === "accept_auto_dictionary_suggestion" ||
          action === "reject_auto_dictionary_suggestion")
          ? { suggestion: toast.retryId }
          : undefined;
      await runToastAction(action, args);
      if (action !== "copy_last_transcription") dismiss(toast.id);
    } catch (error) {
      console.error("Action failed:", error);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || toastsRef.current.length === 0) return;
      event.preventDefault();
      void closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let active = true;
    const showSubscription = subscribeToastShow((payload) => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      const duration = payload.duration ?? DEFAULT_DURATIONS[payload.type];
      const autoDismissEnabled = duration > 0 && payload.autoDismiss !== false;
      const nextToast: ToastState = {
        ...payload,
        id,
        isLeaving: false,
        autoDismissEnabled,
      };

      pendingToastsRef.current.push(nextToast);
      appendNextToast();
      setRetryingId(null);
      resetCopied();
    });
    const hideSubscription = subscribeToastHide(() => void closeAll());
    const recordingSubscription = subscribeRecordingStart(() => closeAll());

    void Promise.all([
      showSubscription,
      hideSubscription,
      recordingSubscription,
    ])
      .then(() => (active ? notifyToastRendererReady() : undefined))
      .catch((error) => {
        console.error("Failed to announce toast renderer readiness:", error);
      });

    return () => {
      active = false;
      showSubscription.then((unsubscribe) => unsubscribe());
      hideSubscription.then((unsubscribe) => unsubscribe());
      recordingSubscription.then((unsubscribe) => unsubscribe());
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      for (const timer of leaveTimersRef.current.values()) clearTimeout(timer);
      pendingToastsRef.current = [];
    };
  }, []);

  const interactivity = (
    <ToastInteractivity
      key={toasts.length > 0 ? "interactive" : "click-through"}
      interactive={toasts.length > 0}
    />
  );
  if (toasts.length === 0) return interactivity;

  return (
    <div className="fixed inset-0 flex flex-col items-end justify-start gap-2 p-4">
      {interactivity}
      <div
        className="flex w-full flex-col-reverse items-end gap-2"
        aria-live="off"
      >
        {[...toasts].reverse().map((toast) => {
          const colors = COLORS[toast.type];
          const showRetry = toast.retryId && toast.mode === "cloud";
          const showCopy = toast.type === "error";
          const copySecondary =
            toast.secondaryAction === "copy_last_transcription";
          return (
            <section
              key={toast.id}
              className={`ui-overlay-notification relative max-h-[140px] w-[404px] max-w-[404px] overflow-x-hidden overflow-y-auto rounded-2xl border px-4 py-3 ${colors.border} ${toast.isLeaving ? "animate-toast-out" : "animate-toast-in"}`}
              role={toast.type === "error" ? "alert" : "status"}
              onMouseEnter={() => clearTimer(toast.id)}
              onMouseLeave={() => {
                if (toast.autoDismissEnabled) {
                  scheduleDismiss(toast.id, RESUME_DISMISS_MS);
                }
              }}
            >
              {toast.type === "celebration" ? (
                <TwinklingGrid variant="cloud" />
              ) : null}
              {toast.type === "update" ? (
                <TwinklingGrid variant="accent" />
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t({
                  id: "toast.close",
                  message: "Close notification",
                })}
                className="absolute right-1 top-1 z-10 grid size-10 place-items-center rounded-xl ui-text-body-sm text-[var(--ui-capture-muted)] transition-colors hover:text-[var(--ui-capture-fg-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              >
                <span aria-hidden="true">✕</span>
              </button>
              <div className="flex items-start gap-3 pr-9">
                {toast.type === "update" ? (
                  <DotMatrix
                    rows={2}
                    cols={2}
                    activeDots={[0, 1, 2, 3]}
                    dotSize={4}
                    gap={2}
                    color="var(--color-accent)"
                    aria-hidden="true"
                  />
                ) : (
                  <div
                    className={`mt-1 size-2 shrink-0 rounded-full ${colors.dot} ${toast.type === "error" ? "animate-pulse" : ""}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {toast.type === "update" ? (
                    <p className="mb-0.5 ui-text-label font-medium ui-color-accent">
                      LOOPER
                    </p>
                  ) : null}
                  <p className="break-words ui-text-body leading-relaxed text-[var(--ui-capture-fg-strong)]">
                    {toast.message}
                  </p>
                  {showRetry ||
                  (toast.action && toast.actionLabel) ||
                  (toast.secondaryAction && toast.secondaryActionLabel) ||
                  showCopy ? (
                    <div className="mt-2 flex min-h-8 items-center gap-3">
                      {showRetry ? (
                        <button
                          type="button"
                          disabled={retryingId === toast.id}
                          onClick={async () => {
                            if (!toast.retryId) return;
                            setRetryingId(toast.id);
                            try {
                              await retryTranscription(toast.retryId);
                            } catch (error) {
                              setRetryingId(null);
                              setToasts((current) =>
                                current.map((currentToast) =>
                                  currentToast.id === toast.id
                                    ? {
                                        ...currentToast,
                                        type: "error",
                                        message:
                                          error instanceof Error
                                            ? error.message
                                            : String(error),
                                      }
                                    : currentToast,
                                ),
                              );
                            }
                          }}
                          className="min-h-10 ui-text-body-sm ui-color-info-strong transition-colors ui-hover-on-solid"
                        >
                          {retryingId === toast.id
                            ? t({
                                id: "toast.retrying",
                                message: "Retrying...",
                              })
                            : t({
                                id: "toast.retry_transcription",
                                message: "Retry transcription",
                              })}
                        </button>
                      ) : null}
                      {toast.action && toast.actionLabel ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleToastAction(toast, toast.action!)
                          }
                          className="min-h-10 ui-text-body-sm font-medium ui-color-info-strong transition-colors ui-hover-on-solid"
                        >
                          {toast.actionLabel} →
                        </button>
                      ) : null}
                      {toast.secondaryAction && toast.secondaryActionLabel ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleToastAction(
                              toast,
                              toast.secondaryAction!,
                            )
                          }
                          className={`min-h-10 ui-text-body-sm font-medium transition-colors ${copySecondary ? "ui-color-info-strong ui-hover-on-solid" : "ui-color-error-soft ui-hover-error-strong"}`}
                        >
                          {copySecondary ? (
                            <Copy size={12} aria-hidden />
                          ) : null}
                          {toast.secondaryActionLabel}
                        </button>
                      ) : null}
                      {showCopy ? (
                        <button
                          type="button"
                          onClick={() => copy(toast.message)}
                          aria-label={
                            copied
                              ? t({ id: "toast.copied", message: "Copied" })
                              : t({
                                  id: "toast.copy_message",
                                  message: "Copy message",
                                })
                          }
                          className="ml-auto grid size-10 place-items-center rounded-xl text-[var(--ui-capture-muted)] transition-colors hover:text-[var(--ui-capture-fg-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
                        >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default ToastOverlay;
