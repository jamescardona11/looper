import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT,
  OVERLAY_USER_DRAG_EVENT,
  persistOverlayPosition,
  setOverlayPosition,
  type OverlayPosition,
} from "../../data/capture/overlay";
import {
  isVisibleOverlayPosition,
  parseOverlayPosition,
} from "./overlay-position";

// v5 conserva únicamente los arrastres de la persona. v4 marcaba un clic
// para expandir o contraer como arrastre y guardaba el reajuste automático.
const OVERLAY_POSITION_STORAGE_KEY = "looper:overlay-position:v5";
const USER_DRAG_GRACE_MS = 1_000;

const readStoredPosition = (): OverlayPosition | null => {
  return parseOverlayPosition(
    localStorage.getItem(OVERLAY_POSITION_STORAGE_KEY),
  );
};

const persistPosition = (position: OverlayPosition): void => {
  localStorage.setItem(OVERLAY_POSITION_STORAGE_KEY, JSON.stringify(position));
};

export function useOverlayPosition(trackMovement: boolean): void {
  const restored = useRef(false);
  const userDragStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const stored = readStoredPosition();
    if (!stored) return;
    setOverlayPosition(stored)
      .then(persistPosition)
      .catch((error) => {
        console.error("Failed to restore overlay position:", error);
      });
  }, []);

  useEffect(() => {
    if (!trackMovement) return;
    const overlayWindow = getCurrentWindow();
    let cancelled = false;
    let saveTimer: number | null = null;
    let unlisten: (() => void) | undefined;
    let automaticMoveUntil = 0;
    const rememberUserDrag = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const compactHandle = target.closest("[data-overlay-drag-handle]");
      if (target.closest("button, textarea, input, a") && !compactHandle) {
        return;
      }
      if (!compactHandle && !target.closest("[data-tauri-drag-region]")) {
        return;
      }
      markUserDrag();
    };
    // La pill se arrastra desde cualquier punto, botones incluidos, y el gesto
    // sólo se convierte en arrastre cuando el puntero viaja. Ese momento lo
    // anuncia el propio arrastre; el DOM no puede deducirlo.
    const markUserDrag = () => {
      userDragStartedAt.current = performance.now();
    };
    const ignoreAutomaticMove = () => {
      userDragStartedAt.current = null;
      automaticMoveUntil = performance.now() + USER_DRAG_GRACE_MS;
    };

    document.addEventListener("pointerdown", rememberUserDrag, true);
    window.addEventListener(OVERLAY_USER_DRAG_EVENT, markUserDrag);
    window.addEventListener(
      OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT,
      ignoreAutomaticMove,
    );

    overlayWindow
      .onMoved(({ payload }) => {
        if (!isVisibleOverlayPosition(payload)) return;
        if (performance.now() < automaticMoveUntil) return;
        const dragStartedAt = userDragStartedAt.current;
        if (
          dragStartedAt == null ||
          performance.now() - dragStartedAt > USER_DRAG_GRACE_MS
        ) {
          userDragStartedAt.current = null;
          return;
        }
        if (saveTimer != null) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          userDragStartedAt.current = null;
          persistOverlayPosition({
            x: payload.x,
            y: payload.y,
          })
            .then((position) => {
              if (!cancelled) persistPosition(position);
            })
            .catch((error) => {
              console.error("Failed to save overlay position:", error);
            });
        }, 120);
      })
      .then((dispose) => {
        if (cancelled) dispose();
        else unlisten = dispose;
      });

    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", rememberUserDrag, true);
      window.removeEventListener(OVERLAY_USER_DRAG_EVENT, markUserDrag);
      window.removeEventListener(
        OVERLAY_POSITION_AUTOMATIC_MOVE_EVENT,
        ignoreAutomaticMove,
      );
      if (saveTimer != null) window.clearTimeout(saveTimer);
      unlisten?.();
    };
  }, [trackMovement]);
}
