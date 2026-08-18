import type { MicrophoneTestLevels } from "./microphone-test-store";

const meter = {
  columns: 32,
  dot: 2,
  gap: 2,
} as const;

const meterWidth = meter.columns * meter.dot + (meter.columns - 1) * meter.gap;

function meterColor(column: number) {
  if (column < 5) return "var(--color-warning)";
  if (column >= meter.columns - 4) return "var(--color-error)";
  return "var(--color-success)";
}

function meterDots(levels: MicrophoneTestLevels) {
  return [levels.left, levels.right].flatMap((level, row) =>
    Array.from({ length: meter.columns }, (_, column) => ({
      active: column < Math.round(level * meter.columns),
      color: meterColor(column),
      key: `${row}-${column}`,
    })),
  );
}

export function MicrophoneLevelMeter({
  levels,
}: {
  levels: MicrophoneTestLevels;
}) {
  return (
    <div
      className="ml-auto grid shrink-0 place-items-center overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${meter.columns}, ${meter.dot}px)`,
        gap: meter.gap,
        width: meterWidth,
      }}
    >
      {meterDots(levels).map((dot) => (
        <span
          key={dot.key}
          className="block"
          style={{
            width: meter.dot,
            height: meter.dot,
            backgroundColor: dot.color,
            opacity: dot.active ? 0.95 : 0.16,
            borderRadius: dot.active ? 0.5 : "50%",
            transition: "border-radius 0.18s ease-out, opacity 0.18s ease-out",
          }}
        />
      ))}
    </div>
  );
}
