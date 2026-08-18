import type { MouseEvent, TouchEvent } from "react";
import { draggedPlaybackRate } from "./library-player-state";

type RateDragStartEvent =
  MouseEvent<HTMLSpanElement> | TouchEvent<HTMLSpanElement>;

function pointerX(
  event: RateDragStartEvent | globalThis.MouseEvent | globalThis.TouchEvent,
): number {
  return "touches" in event ? event.touches[0].clientX : event.clientX;
}

export function startLibraryRateDrag(
  event: RateDragStartEvent,
  initialRate: number,
  onRateChange: (rate: number) => void,
): () => void {
  event.preventDefault();
  const originX = pointerX(event);

  const move = (nextEvent: globalThis.MouseEvent | globalThis.TouchEvent) => {
    const nextRate = draggedPlaybackRate(
      initialRate,
      pointerX(nextEvent) - originX,
    );
    onRateChange(nextRate);
  };

  const finish = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", finish);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", finish);
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", finish);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", finish);
  return finish;
}
