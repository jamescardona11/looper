import type { UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useReducer, useRef, useState } from "react";
import { subscribeAudioSpectrum } from "../../data/capture/audio";
import { syncPillRendererState } from "../../data/capture/dictation";
import {
  subscribePillError,
  subscribePillHover,
  subscribePillInserted,
  subscribePillMode,
  subscribePillState,
} from "../../data/capture/overlay";
import { subscribeTransformStream } from "../../data/transcription";
import { useMountEffect } from "../../shared/hooks/useMountEffect";
import { safeUnlisten } from "../../shared/lib/safeUnlisten";
import type { PillStatus, PillTone } from "../../contracts";

const insertedVisibilityMs = 4_000;
const spectrumBinCount = 256;
const errorFlashDurationMs = 1_200;

type InsertionConfirmation = { chars: number; canUndo: boolean };
type PillViewState = {
  retryId: string | null;
  inserted: InsertionConfirmation | null;
  pillStatus: PillStatus;
  isErrorFlashing: boolean;
  isExpanded: boolean;
  expandedText: string;
  pillTone: PillTone;
  usedScreenContext: boolean;
  isHovered: boolean;
};

type PillViewAction =
  | { type: "status"; value: PillStatus }
  | { type: "retry"; value: string | null }
  | { type: "inserted"; value: InsertionConfirmation | null }
  | { type: "error-flash"; value: boolean }
  | {
      type: "mode";
      expanded: boolean;
      text: string;
      tone: PillTone;
      usedScreenContext: boolean;
    }
  | { type: "stream"; text: string }
  | { type: "hover"; value: boolean };

const initialPillView: PillViewState = {
  retryId: null,
  inserted: null,
  pillStatus: "idle",
  isErrorFlashing: false,
  isExpanded: false,
  expandedText: "",
  pillTone: "default",
  usedScreenContext: false,
  isHovered: false,
};

function updateStatus(state: PillViewState, status: PillStatus): PillViewState {
  const next = { ...state, pillStatus: status };
  if (status === "idle") {
    return {
      ...next,
      isErrorFlashing: false,
      isExpanded: false,
      expandedText: "",
      pillTone: "default",
      usedScreenContext: false,
    };
  }
  if (status === "listening") return { ...next, pillTone: "default" };
  if (status !== "cancelled") return next;
  return {
    ...next,
    isExpanded: false,
    expandedText: "",
    pillTone: "default",
    usedScreenContext: false,
  };
}

function reducePillView(
  state: PillViewState,
  action: PillViewAction,
): PillViewState {
  switch (action.type) {
    case "status":
      return updateStatus(state, action.value);
    case "retry":
      return { ...state, retryId: action.value };
    case "inserted":
      return { ...state, inserted: action.value };
    case "error-flash":
      return { ...state, isErrorFlashing: action.value };
    case "mode":
      return {
        ...state,
        isExpanded: action.expanded,
        expandedText: action.expanded ? action.text : "",
        pillTone: action.tone,
        usedScreenContext: action.expanded ? action.usedScreenContext : false,
      };
    case "stream":
      return { ...state, isExpanded: true, expandedText: action.text };
    case "hover":
      return { ...state, isHovered: action.value };
  }
}

type SubscriptionScope = {
  open: boolean;
  releases: UnlistenFn[];
};

function trackSubscription<TPayload>(
  scope: SubscriptionScope,
  channel: string,
  subscribe: (handler: (payload: TPayload) => void) => Promise<UnlistenFn>,
  handle: (payload: TPayload) => void,
): Promise<void> {
  return subscribe((payload) => {
    if (scope.open) handle(payload);
  })
    .then((release) => {
      if (scope.open) scope.releases.push(release);
      else safeUnlisten(release);
    })
    .catch((error) => {
      console.error(`Failed to listen for ${channel}`, error);
    });
}

export function usePillState() {
  const [view, dispatch] = useReducer(reducePillView, initialPillView);
  const statusRef = useRef<PillStatus>("idle");
  const insertedTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialSpectrum] = useState(() => new Uint8Array(spectrumBinCount));
  const spectrumBinsRef = useRef(initialSpectrum);
  const lastSpectrumAtRef = useRef(0);

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current === null) return;
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = null;
  }, []);

  const flashError = useCallback(() => {
    clearErrorTimer();
    dispatch({ type: "error-flash", value: true });
    errorTimerRef.current = setTimeout(() => {
      errorTimerRef.current = null;
      dispatch({ type: "error-flash", value: false });
    }, errorFlashDurationMs);
  }, [clearErrorTimer]);

  const resetSpectrum = useCallback(() => {
    spectrumBinsRef.current.fill(0);
    lastSpectrumAtRef.current = 0;
  }, []);

  const applyStatus = useCallback(
    (status: PillStatus) => {
      if (statusRef.current === status) {
        if (status === "error") flashError();
        return;
      }

      statusRef.current = status;
      if (status === "idle") clearErrorTimer();
      if (status === "listening" || status === "cancelled") resetSpectrum();
      dispatch({ type: "status", value: status });
      if (status === "error") flashError();
    },
    [clearErrorTimer, flashError, resetSpectrum],
  );

  const dismiss = useCallback(() => applyStatus("idle"), [applyStatus]);

  useMountEffect(() => {
    const scope: SubscriptionScope = { open: true, releases: [] };
    const ready: Promise<void>[] = [];
    const attachPillEvent = <TPayload>(
      channel: string,
      subscribe: (handler: (payload: TPayload) => void) => Promise<UnlistenFn>,
      handle: (payload: TPayload) => void,
    ) => {
      ready.push(trackSubscription(scope, channel, subscribe, handle));
    };

    attachPillEvent("pill:state", subscribePillState, ({ status }) => {
      if (status !== "error") dispatch({ type: "retry", value: null });
      if (status !== "idle") {
        if (insertedTimerRef.current !== null) {
          window.clearTimeout(insertedTimerRef.current);
          insertedTimerRef.current = null;
        }
        dispatch({ type: "inserted", value: null });
      }
      applyStatus(status);
    });

    attachPillEvent("pill:error", subscribePillError, ({ retry_id }) => {
      dispatch({ type: "retry", value: retry_id });
    });

    attachPillEvent(
      "pill:inserted",
      subscribePillInserted,
      ({ chars, can_undo }) => {
        if (chars <= 0) return;
        dispatch({
          type: "inserted",
          value: { chars, canUndo: can_undo },
        });
        if (insertedTimerRef.current !== null) {
          window.clearTimeout(insertedTimerRef.current);
        }
        insertedTimerRef.current = window.setTimeout(() => {
          dispatch({ type: "inserted", value: null });
          insertedTimerRef.current = null;
        }, insertedVisibilityMs);
      },
    );

    void trackSubscription(
      scope,
      "audio:spectrum",
      subscribeAudioSpectrum,
      ({ bins }) => {
        if (statusRef.current !== "listening") return;
        if (bins.length === spectrumBinsRef.current.length) {
          spectrumBinsRef.current.set(bins);
        } else {
          spectrumBinsRef.current = new Uint8Array(bins);
        }
        lastSpectrumAtRef.current = performance.now();
      },
    );

    attachPillEvent(
      "pill:mode",
      subscribePillMode,
      ({ expanded, text, tone, usedScreenContext }) => {
        if (statusRef.current === "idle" || statusRef.current === "cancelled") {
          return;
        }
        dispatch({
          type: "mode",
          expanded,
          text: text ?? "",
          tone: tone ?? "default",
          usedScreenContext: usedScreenContext ?? false,
        });
      },
    );

    void trackSubscription(
      scope,
      "pill:transform-stream",
      subscribeTransformStream,
      ({ text }) => {
        if (statusRef.current === "idle") return;
        dispatch({ type: "stream", text: text ?? "" });
      },
    );

    attachPillEvent("pill:hover", subscribePillHover, ({ hovering }) => {
      dispatch({ type: "hover", value: hovering });
    });

    void Promise.all(ready).then(() => {
      if (scope.open) return syncPillRendererState();
    });

    return () => {
      scope.open = false;
      clearErrorTimer();
      scope.releases.forEach(safeUnlisten);
      scope.releases = [];
    };
  });

  const dismissInserted = useCallback(() => {
    if (insertedTimerRef.current !== null) {
      window.clearTimeout(insertedTimerRef.current);
      insertedTimerRef.current = null;
    }
    dispatch({ type: "inserted", value: null });
  }, []);

  return {
    retryId: view.retryId,
    inserted: view.inserted,
    dismissInserted,
    pillStatus: view.pillStatus,
    spectrumBinsRef,
    lastSpectrumAtRef,
    isErrorFlashing: view.isErrorFlashing,
    isExpanded: view.isExpanded,
    expandedText: view.expandedText,
    pillTone: view.pillTone,
    usedScreenContext: view.usedScreenContext,
    isHovered: view.isHovered,
    dismiss,
  };
}
