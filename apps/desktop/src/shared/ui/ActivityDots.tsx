import { useCallback, useRef, useSyncExternalStore } from "react";
import DotMatrix from "./DotMatrix";

const ACTIVITY_PATTERNS: readonly (readonly number[])[] = [
  [0, 3],
  [1, 2],
  [0, 1, 2, 3],
  [0, 1],
  [2, 3],
];

type ActivityDotsProps = {
  color?: string;
  dotSize?: number;
  gap?: number;
  intervalMs?: number;
};

function useActivityFrame(intervalMs: number) {
  const frame = useRef(0);
  const subscribe = useCallback(
    (notify: () => void) => {
      const timer = window.setInterval(() => {
        frame.current = (frame.current + 1) % ACTIVITY_PATTERNS.length;
        notify();
      }, intervalMs);

      return () => window.clearInterval(timer);
    },
    [intervalMs],
  );
  const getSnapshot = useCallback(() => frame.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

function ActivityDots({
  color = "var(--color-text-muted)",
  dotSize = 3,
  gap = 2,
  intervalMs = 640,
}: ActivityDotsProps) {
  const frame = useActivityFrame(intervalMs);

  return (
    <DotMatrix
      rows={2}
      cols={2}
      activeDots={ACTIVITY_PATTERNS[frame] ?? ACTIVITY_PATTERNS[0]}
      dotSize={dotSize}
      gap={gap}
      color={color}
      snapDots
      aria-hidden="true"
    />
  );
}

export default ActivityDots;
