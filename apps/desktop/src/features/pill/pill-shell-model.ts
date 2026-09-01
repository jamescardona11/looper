import type { PillStatus } from "../../contracts";
import {
  SIGNAL_RAIL_COLLAPSED_WIDTH,
  SIGNAL_RAIL_COMPACT_HEIGHT,
  SIGNAL_RAIL_EXPANDED_WIDTH,
  SIGNAL_RAIL_HEIGHT,
  SIGNAL_RAIL_ONE_LINE_WIDTH,
  SIGNAL_RAIL_RADIUS,
} from "./SignalRail";

export const PILL_EXPANDED_WIDTH = 260;

const resultMinimumHeight = 132;
const resultMaximumHeight = 220;

export function measureResultCard(text: string) {
  const lines = text
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / 30)),
      0,
    );
  const requested = resultMinimumHeight + Math.max(0, lines - 2) * 20;
  return {
    height: Math.min(resultMaximumHeight, requested),
    scrollable: requested > resultMaximumHeight,
  };
}

type ShellInput = {
  expanded: boolean;
  hovered: boolean;
  inserted: boolean;
  retryAvailable: boolean;
  resultCard: boolean;
  resultHeight: number;
  actionSelect: boolean;
  status: PillStatus;
};

export function resolvePillShellGeometry(input: ShellInput) {
  const compactOneLine =
    !input.hovered &&
    (input.status === "listening" || input.status === "processing");
  const width = input.expanded
    ? PILL_EXPANDED_WIDTH
    : input.hovered || input.inserted || input.retryAvailable
      ? SIGNAL_RAIL_EXPANDED_WIDTH
      : compactOneLine
        ? SIGNAL_RAIL_ONE_LINE_WIDTH
        : SIGNAL_RAIL_COLLAPSED_WIDTH;
  const tallRail =
    input.hovered ||
    input.status === "error" ||
    input.status === "cancelled" ||
    input.inserted;
  const height = input.expanded
    ? input.resultCard
      ? input.resultHeight
      : input.actionSelect
        ? 146
        : 90
    : tallRail
      ? SIGNAL_RAIL_HEIGHT
      : SIGNAL_RAIL_COMPACT_HEIGHT;

  return {
    width,
    height,
    radius: input.expanded ? 24 : SIGNAL_RAIL_RADIUS,
  };
}
