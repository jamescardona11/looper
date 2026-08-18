import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  subscribeShortcutCapture,
  type ShortcutCapturePayload,
} from "../../data/shortcuts";
import { formatShortcutForDisplay } from "../lib/shortcuts";

type UseShortcutCaptureOptions = {
  active: boolean;
  onCancel: () => void | Promise<void>;
  onPreviewChange: (preview: string) => void;
  onShortcutCaptured: (shortcut: string) => void;
  onCaptureCancelled?: () => void;
  onError?: (message: string) => void;
  onCaptureInput?: () => void;
};

const STATIC_SNAPSHOT = () => 0;

export function useShortcutCapture(options: UseShortcutCaptureOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const resetCaptureState = useCallback(() => {
    optionsRef.current.onPreviewChange("");
  }, []);

  const subscribe = useCallback(() => {
    if (!options.active) return () => undefined;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const current = () => optionsRef.current;
    const stopNativeCapture = async () => {
      try {
        await current().onCancel();
      } catch (error) {
        current().onError?.(String(error));
      }
    };
    const finish = async (shortcut: string) => {
      if (disposed) return;
      disposed = true;
      unlisten?.();
      unlisten = null;
      await stopNativeCapture();
      current().onShortcutCaptured(shortcut);
      resetCaptureState();
    };
    const cancel = async () => {
      if (disposed) return;
      disposed = true;
      unlisten?.();
      unlisten = null;
      await stopNativeCapture();
      current().onCaptureCancelled?.();
      resetCaptureState();
    };
    const handlePayload = (payload: ShortcutCapturePayload) => {
      if (disposed) return;
      if (payload.kind === "preview") {
        current().onCaptureInput?.();
        current().onPreviewChange(formatShortcutForDisplay(payload.shortcut));
        return;
      }
      if (payload.kind === "captured") {
        current().onCaptureInput?.();
        void finish(payload.shortcut);
        return;
      }
      current().onError?.(payload.message);
      void cancel();
    };

    void subscribeShortcutCapture(handlePayload)
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        current().onError?.(String(error));
        void cancel();
      });

    const blockKeyboard = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const modified =
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
      if (event.type === "keydown" && event.key === "Escape" && !modified) {
        void cancel();
      }
    };
    const blockAuxiliaryMouse = (event: MouseEvent) => {
      if (event.button === 0) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", blockKeyboard, true);
    window.addEventListener("keyup", blockKeyboard, true);
    window.addEventListener("mousedown", blockAuxiliaryMouse, true);
    window.addEventListener("mouseup", blockAuxiliaryMouse, true);
    window.addEventListener("auxclick", blockAuxiliaryMouse, true);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", blockKeyboard, true);
      window.removeEventListener("keyup", blockKeyboard, true);
      window.removeEventListener("mousedown", blockAuxiliaryMouse, true);
      window.removeEventListener("mouseup", blockAuxiliaryMouse, true);
      window.removeEventListener("auxclick", blockAuxiliaryMouse, true);
    };
  }, [options.active, resetCaptureState]);

  useSyncExternalStore(subscribe, STATIC_SNAPSHOT, STATIC_SNAPSHOT);
  return { resetCaptureState };
}
