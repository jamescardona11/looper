import { useMountEffect } from "../../shared/hooks/useMountEffect";
import {
  subscribeOverlayPosition,
  setOverlayPosition,
  type OverlayPosition,
} from "../../data/capture/overlay";
import {
  isVisibleOverlayPosition,
  parseOverlayPosition,
} from "./overlay-position";

const OVERLAY_POSITION_STORAGE_KEY = "looper:overlay-position:v5";

function persistPosition(position: OverlayPosition): void {
  localStorage.setItem(OVERLAY_POSITION_STORAGE_KEY, JSON.stringify(position));
}

// Rust publishes only completed user drags, in canonical coordinates. Window
// moves caused by hover, display recovery and presentation changes stay native.
export function useOverlayPosition(): void {
  useMountEffect(() => {
    let cancelled = false;
    let moved = false;
    let unlisten: (() => void) | undefined;
    void subscribeOverlayPosition((position) => {
      if (cancelled || !isVisibleOverlayPosition(position)) return;
      moved = true;
      persistPosition(position);
    })
      .then(async (dispose) => {
        if (cancelled) {
          dispose();
          return;
        }
        unlisten = dispose;
        const stored = parseOverlayPosition(
          localStorage.getItem(OVERLAY_POSITION_STORAGE_KEY),
        );
        if (!stored || moved) return;
        const corrected = await setOverlayPosition(stored);
        if (!cancelled && !moved) persistPosition(corrected);
      })
      .catch((error) => {
        console.error("Failed to synchronize the overlay position:", error);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  });
}
