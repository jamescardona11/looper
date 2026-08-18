import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import DotMatrix from "./DotMatrix";

type ActivityDotsProps = {
  color?: string;
  dotSize?: number;
  gap?: number;
  intervalMs?: number;
};

const DEFAULT_ACTIVITY_DOTS = {
  color: "var(--color-text-muted)",
  dotSize: 3,
  gap: 2,
  intervalMs: 640,
} as const;

const FRAME_MASKS = [0b1001, 0b0110, 0b1111, 0b0011, 0b1100] as const;
const CELL_POSITIONS = [0, 1, 2, 3] as const;

function visibleCells(frame: number): number[] {
  const mask = FRAME_MASKS[frame] ?? FRAME_MASKS[0];
  return CELL_POSITIONS.filter((position) => (mask & (1 << position)) !== 0);
}

function useActivityFrame(intervalMs: number): number {
  const frame = useRef(0);
  const subscribe = useMemo(
    () => (notify: () => void) => {
      const timer = window.setInterval(() => {
        frame.current = (frame.current + 1) % FRAME_MASKS.length;
        notify();
      }, intervalMs);
      return () => window.clearInterval(timer);
    },
    [intervalMs],
  );
  const getSnapshot = useCallback(() => frame.current, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}

function ActivityDots(props: ActivityDotsProps) {
  const color = props.color ?? DEFAULT_ACTIVITY_DOTS.color;
  const size = props.dotSize ?? DEFAULT_ACTIVITY_DOTS.dotSize;
  const spacing = props.gap ?? DEFAULT_ACTIVITY_DOTS.gap;
  const interval = props.intervalMs ?? DEFAULT_ACTIVITY_DOTS.intervalMs;
  const frame = useActivityFrame(interval);
  return (
    <DotMatrix
      rows={2}
      cols={2}
      activeDots={visibleCells(frame)}
      dotSize={size}
      gap={spacing}
      color={color}
      snapDots
      aria-hidden="true"
    />
  );
}

export default ActivityDots;
