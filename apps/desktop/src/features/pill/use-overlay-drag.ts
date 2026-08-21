import { useCallback, useEffect, useRef } from "react";
import { beginOverlayDrag, endOverlayDrag } from "../../data/capture/dictation";

// How far the pointer travels before a press turns into a drag. Below it the
// press is still a click, so every control stays clickable.
export const DRAG_THRESHOLD_PX = 4;

// Text entry and menus own their pointer: dragging from them would fight
// selection and item picking.
const NEVER_DRAG_SELECTOR = "input, textarea, [contenteditable], [role='menu']";

export function isDragCandidate(button: number, target: EventTarget | null) {
  if (button !== 0) return false;
  return !(target as Element | null)?.closest?.(NEVER_DRAG_SELECTOR);
}

export function exceedsDragThreshold(
  origin: { x: number; y: number },
  point: { x: number; y: number },
) {
  return (
    Math.hypot(point.x - origin.x, point.y - origin.y) >= DRAG_THRESHOLD_PX
  );
}

// Drag the overlay from anywhere on it.
//
// A press only becomes a drag once the pointer actually moves, so the pill
// needs no dedicated grip - the whole shell is both draggable and clickable,
// and whichever the user meant is decided by what they do next. The native
// drag also freezes hover tracking: polling through a drag used to collapse
// the pill mid-move and hand the panel back to click-through.
export function useOverlayDrag() {
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const releaseRef = useRef<(() => void) | undefined>(undefined);

  const endDrag = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = undefined;
    if (!draggingRef.current) return;
    draggingRef.current = false;
    void endOverlayDrag().catch((error) => {
      console.error("Failed to release the pill drag:", error);
    });
  }, []);

  useEffect(() => endDrag, [endDrag]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      suppressClickRef.current = false;
      if (!isDragCandidate(event.button, event.target)) return;

      const origin = { x: event.clientX, y: event.clientY };
      const watchForDrag = (move: PointerEvent) => {
        if (
          !exceedsDragThreshold(origin, { x: move.clientX, y: move.clientY })
        ) {
          return;
        }
        stopWatching();
        draggingRef.current = true;
        suppressClickRef.current = true;
        watchForRelease();
        void beginOverlayDrag().catch((error) => {
          console.error("Failed to drag the pill:", error);
          endDrag();
        });
      };

      // The window server swallows the pointer-up that ends a native drag, so
      // the release is also inferred from the first move with no button held.
      const watchForRelease = () => {
        const onMove = (move: PointerEvent) => {
          if (move.buttons === 0) endDrag();
        };
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("blur", endDrag);
        releaseRef.current = () => {
          window.removeEventListener("pointerup", endDrag);
          window.removeEventListener("pointercancel", endDrag);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("blur", endDrag);
        };
      };

      function stopWatching() {
        window.removeEventListener("pointermove", watchForDrag);
        window.removeEventListener("pointerup", stopWatching);
        window.removeEventListener("pointercancel", stopWatching);
        releaseRef.current = undefined;
      }

      window.addEventListener("pointermove", watchForDrag);
      window.addEventListener("pointerup", stopWatching);
      window.addEventListener("pointercancel", stopWatching);
      // Unmounting mid-press has to tear these down too, so the pending watch
      // is what `endDrag` releases until a real drag replaces it.
      releaseRef.current = stopWatching;
    },
    [endDrag],
  );

  // Swallows the click that a completed drag would otherwise fire.
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    // Fires after the pointer-up that already ended the drag, so it reads a
    // one-shot flag rather than the live drag state.
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { onPointerDown, onClickCapture };
}
