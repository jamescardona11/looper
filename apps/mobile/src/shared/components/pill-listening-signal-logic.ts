export const PILL_SIGNAL_WIDTH = 32;
export const PILL_SIGNAL_HEIGHT = 18;
const DOT_SPACING = 3;

export interface PillDot {
  column: number;
  intensity: (level: number) => number;
  maskOpacity: number;
  row: number;
  x: number;
  y: number;
}

export function meteringToAudioLevel(metering: number | undefined): number {
  if (metering === undefined || !Number.isFinite(metering)) return 0;
  const normalizedDb = clamp(metering, -60, 0);
  return clamp(10 ** (normalizedDb / 40), 0, 1);
}

export function smoothAudioLevel(previous: number, next: number): number {
  const response = next > previous ? 0.5 : 0.1;
  return clamp(previous + (next - previous) * response, 0, 1);
}

export function createPillDotGrid(): PillDot[] {
  const columns = Math.floor(PILL_SIGNAL_WIDTH / DOT_SPACING);
  const rows = Math.floor(PILL_SIGNAL_HEIGHT / DOT_SPACING);
  const centerColumn = (columns - 1) / 2;
  const centerRow = (rows - 1) / 2;

  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * DOT_SPACING + 1;
    const y = row * DOT_SPACING + 1;
    const columnDistance = Math.abs(column - centerColumn) / centerColumn;
    const rowDistance = Math.abs(row - centerRow);
    const columnGain = 1 - columnDistance * 0.42;
    const edgeDistance = Math.hypot(
      (x - PILL_SIGNAL_WIDTH / 2) / (PILL_SIGNAL_WIDTH / 2),
      (y - PILL_SIGNAL_HEIGHT / 2) / (PILL_SIGNAL_HEIGHT / 2),
    );
    const maskOpacity = clamp(1.1 - edgeDistance * 0.42, 0.34, 1);

    return {
      column,
      intensity: (level) => {
        const radius = clamp(level, 0, 1) * columnGain * (PILL_SIGNAL_HEIGHT * 0.45);
        return clamp(radius - rowDistance * DOT_SPACING + 0.75, 0, 1);
      },
      maskOpacity,
      row,
      x,
      y,
    };
  });
}

export function formatPillDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
