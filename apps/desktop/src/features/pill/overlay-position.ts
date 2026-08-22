import type { OverlayPosition } from "../../data/capture/overlay";

const OFFSCREEN_SENTINEL_LIMIT = -5_000;

export function parseOverlayPosition(
  raw: string | null,
): OverlayPosition | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return { x: value.x, y: value.y };
    }
  } catch {
    // A malformed UI preference is equivalent to no saved position.
  }
  return null;
}

export function isVisibleOverlayPosition(position: OverlayPosition): boolean {
  return (
    position.x > OFFSCREEN_SENTINEL_LIMIT &&
    position.y > OFFSCREEN_SENTINEL_LIMIT
  );
}
