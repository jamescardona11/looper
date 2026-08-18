import { useSyncExternalStore } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const subscribers = new Set<() => void>();
let shiftHeld = false;
let detachSources: (() => void) | null = null;

function updateShiftHeld(next: boolean): void {
  if (shiftHeld === next) return;
  shiftHeld = next;
  subscribers.forEach((notify) => notify());
}

function attachShiftSources(): () => void {
  let disposed = false;
  let detachFocus: UnlistenFn | null = null;
  const reset = () => updateShiftHeld(false);
  const readKeyboard = (event: KeyboardEvent) =>
    updateShiftHeld(event.shiftKey);
  const readPointer = (event: PointerEvent) => updateShiftHeld(event.shiftKey);
  const readVisibility = () => {
    if (document.visibilityState !== "visible") reset();
  };

  try {
    void getCurrentWindow()
      .onFocusChanged(reset)
      .then((unlisten) => {
        if (disposed) unlisten();
        else detachFocus = unlisten;
      })
      .catch(() => {});
  } catch {
    // Browser and test runtimes do not expose Tauri window metadata.
  }

  document.addEventListener("keydown", readKeyboard);
  document.addEventListener("keyup", readKeyboard);
  document.addEventListener("pointerdown", readPointer);
  document.addEventListener("visibilitychange", readVisibility);
  window.addEventListener("blur", reset);
  window.addEventListener("focus", reset);

  return () => {
    disposed = true;
    document.removeEventListener("keydown", readKeyboard);
    document.removeEventListener("keyup", readKeyboard);
    document.removeEventListener("pointerdown", readPointer);
    document.removeEventListener("visibilitychange", readVisibility);
    window.removeEventListener("blur", reset);
    window.removeEventListener("focus", reset);
    detachFocus?.();
    updateShiftHeld(false);
  };
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  if (subscribers.size === 1) detachSources = attachShiftSources();

  return () => {
    subscribers.delete(notify);
    if (subscribers.size > 0) return;
    detachSources?.();
    detachSources = null;
  };
}

const getShiftSnapshot = () => shiftHeld;
const getServerSnapshot = () => false;

export function useShiftHeld(enabled = true): boolean {
  const held = useSyncExternalStore(
    subscribe,
    getShiftSnapshot,
    getServerSnapshot,
  );
  return enabled && held;
}
