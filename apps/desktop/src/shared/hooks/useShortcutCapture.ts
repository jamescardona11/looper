import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  subscribeShortcutCapture,
  type ShortcutCapturePayload,
} from "../../data/shortcuts";
import { formatShortcutForDisplay } from "../lib/shortcuts";

type RequiredCaptureCallbacks = {
  onCancel: () => void | Promise<void>;
  onPreviewChange: (preview: string) => void;
  onShortcutCaptured: (shortcut: string) => void;
};
type OptionalCaptureCallback = "onCaptureCancelled" | "onCaptureInput";
type UseShortcutCaptureOptions = RequiredCaptureCallbacks &
  Partial<Record<OptionalCaptureCallback, () => void>> & {
    active: boolean;
    onError?: (message: string) => void;
  };

type CaptureOutcome =
  { kind: "captured"; shortcut: string } | { kind: "cancelled" };

const STATIC_SNAPSHOT = () => 0;

function createCaptureSession(
  readOptions: () => UseShortcutCaptureOptions,
  resetPreview: () => void,
) {
  let disposed = false;
  let detachNative: (() => void) | null = null;

  const detach = () => {
    detachNative?.();
    detachNative = null;
  };
  const stopNative = async () => {
    try {
      await readOptions().onCancel();
    } catch (error) {
      readOptions().onError?.(String(error));
    }
  };
  const settle = async (outcome: CaptureOutcome) => {
    if (disposed) return;
    disposed = true;
    detach();
    await stopNative();
    if (outcome.kind === "captured") {
      readOptions().onShortcutCaptured(outcome.shortcut);
    } else {
      readOptions().onCaptureCancelled?.();
    }
    resetPreview();
  };
  const receive = (payload: ShortcutCapturePayload) => {
    if (disposed) return;
    const options = readOptions();
    if (payload.kind === "preview") {
      options.onCaptureInput?.();
      options.onPreviewChange(formatShortcutForDisplay(payload.shortcut));
    } else if (payload.kind === "captured") {
      options.onCaptureInput?.();
      void settle({ kind: "captured", shortcut: payload.shortcut });
    } else {
      options.onError?.(payload.message);
      void settle({ kind: "cancelled" });
    }
  };
  const reportSubscriptionFailure = (error: unknown) => {
    if (disposed) return;
    readOptions().onError?.(String(error));
    void settle({ kind: "cancelled" });
  };

  return {
    receive,
    cancel: () => settle({ kind: "cancelled" }),
    attach(cleanup: () => void) {
      if (disposed) cleanup();
      else detachNative = cleanup;
    },
    reportSubscriptionFailure,
    dispose() {
      disposed = true;
      detach();
    },
  };
}

function blockCaptureInput(cancel: () => void) {
  const keyboard = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const modified =
      event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
    if (event.type === "keydown" && event.key === "Escape" && !modified) {
      cancel();
    }
  };
  const auxiliaryMouse = (event: MouseEvent) => {
    if (event.button === 0) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const keyboardEvents = ["keydown", "keyup"] as const;
  const mouseEvents = ["mousedown", "mouseup", "auxclick"] as const;
  keyboardEvents.forEach((name) =>
    window.addEventListener(name, keyboard, true),
  );
  mouseEvents.forEach((name) =>
    window.addEventListener(name, auxiliaryMouse, true),
  );

  return () => {
    keyboardEvents.forEach((name) =>
      window.removeEventListener(name, keyboard, true),
    );
    mouseEvents.forEach((name) =>
      window.removeEventListener(name, auxiliaryMouse, true),
    );
  };
}

export function useShortcutCapture(options: UseShortcutCaptureOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const resetCaptureState = useCallback(() => {
    optionsRef.current.onPreviewChange("");
  }, []);

  const subscribe = useCallback(() => {
    if (!options.active) return () => undefined;
    const session = createCaptureSession(
      () => optionsRef.current,
      resetCaptureState,
    );
    void subscribeShortcutCapture(session.receive)
      .then(session.attach)
      .catch(session.reportSubscriptionFailure);
    const unblockInput = blockCaptureInput(() => void session.cancel());

    return () => {
      session.dispose();
      unblockInput();
    };
  }, [options.active, resetCaptureState]);

  useSyncExternalStore(subscribe, STATIC_SNAPSHOT, STATIC_SNAPSHOT);
  return { resetCaptureState };
}
