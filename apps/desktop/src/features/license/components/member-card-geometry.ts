import type { CSSProperties } from "react";
import { EDITION_COLORS } from "../../../shared/lib/licenseEdition";
import type { PurchaseTier } from "../../license/purchaseConfig";
import type { MemberCardPalette } from "./member-card-palette";

const cardDimensions = {
  width: 400,
  stampWidth: 132,
  stampHeight: 38,
  headlineHeight: 58,
  expandedHeadlineHeight: 102,
  headlineOverlap: 12,
  detailsHeight: 88,
  slimDetailsHeight: 44,
  headlineGap: 4,
  stripeGap: 10,
  cornerRadius: 8,
  padding: 20,
} as const;

const stripeGrid = {
  density: 0.26,
  dividerOffset: -6,
  dotSize: 3,
  dotGap: 3,
  verticalInset: 4,
  rows: 7,
} as const;

const securityGrid = { dotSize: 2, pitch: 9 } as const;
const swapTiming = { sweep: 560, blink: 90, buffer: 48 } as const;

export const CARD_WIDTH = cardDimensions.width;
export const CARD_STAMP_SLOT_WIDTH = cardDimensions.stampWidth;
export const CARD_STAMP_SLOT_HEIGHT = cardDimensions.stampHeight;
export const CARD_HEADER_HEIGHT = CARD_STAMP_SLOT_HEIGHT;
export const CARD_HEADLINE_HEIGHT = cardDimensions.headlineHeight;
export const CARD_HEADLINE_HEIGHT_EXPANDED =
  cardDimensions.expandedHeadlineHeight;
export const CARD_HEADLINE_OVERLAP = cardDimensions.headlineOverlap;
export const CARD_DETAILS_HEIGHT = cardDimensions.detailsHeight;
export const CARD_DETAILS_HEIGHT_SLIM = cardDimensions.slimDetailsHeight;
export const CARD_HEADLINE_GAP = cardDimensions.headlineGap;
export const CARD_STRIPE_DENSITY = stripeGrid.density;
export const CARD_STRIPE_GAP = cardDimensions.stripeGap;
export const CARD_RADIUS = cardDimensions.cornerRadius;
export const CARD_PADDING = cardDimensions.padding;
export const CARD_INNER_WIDTH = CARD_WIDTH - CARD_PADDING * 2;
export const STRIPE_DIVIDER_OFFSET = stripeGrid.dividerOffset;
export const CARD_TITLE_FONT = "var(--font-license-card)";

export const STRIPE_DOT_SIZE = stripeGrid.dotSize;
export const STRIPE_DOT_GAP = stripeGrid.dotGap;
export const STRIPE_DOT_PITCH = STRIPE_DOT_SIZE + STRIPE_DOT_GAP;
export const STRIPE_VERTICAL_INSET = stripeGrid.verticalInset;
export const STRIPE_ROWS = stripeGrid.rows;
export const STRIPE_CORNER_RADIUS = CARD_RADIUS - 1;
export const STRIPE_COLS = Math.floor(
  (CARD_WIDTH + STRIPE_DOT_GAP) / STRIPE_DOT_PITCH,
);
export const STRIPE_FIELD_HEIGHT =
  STRIPE_ROWS * STRIPE_DOT_SIZE + (STRIPE_ROWS - 1) * STRIPE_DOT_GAP;
export const STRIPE_HEIGHT = STRIPE_FIELD_HEIGHT + STRIPE_VERTICAL_INSET * 2;

export const SECURITY_DOT_SIZE = securityGrid.dotSize;
export const SECURITY_DOT_PITCH = securityGrid.pitch;
export const SECURITY_COLS = Math.floor(CARD_WIDTH / SECURITY_DOT_PITCH);
export const DOT_SWAP_SWEEP_MS = swapTiming.sweep;
export const DOT_SWAP_BLINK_MS = swapTiming.blink;
export const DOT_SWAP_TOTAL_MS =
  DOT_SWAP_SWEEP_MS + DOT_SWAP_BLINK_MS + swapTiming.buffer;

export const MEMBER_CARD_LAYOUT_ID = "looper-member-card";
export const EDITION_STAMP_COLORS = EDITION_COLORS;
export const TIER_COLORS = Object.fromEntries(
  (["personal", "commercial"] as const).map((tier) => [
    tier,
    EDITION_COLORS[tier],
  ]),
) as Record<PurchaseTier, { fg: string; bg: string }>;

export type MemberCardDot = { x: number; y: number; active: boolean };
export type StripeDotTransitionMode = "none" | "sweep";

export const getCardContentHeight = (): number =>
  CARD_HEADER_HEIGHT +
  CARD_HEADLINE_HEIGHT +
  8 +
  CARD_DETAILS_HEIGHT +
  CARD_STRIPE_GAP +
  STRIPE_HEIGHT -
  CARD_HEADLINE_OVERLAP;

export const getMemberCardHeight = (): number =>
  CARD_PADDING + getCardContentHeight();

export const getCardShellStyle = (
  palette: MemberCardPalette,
): CSSProperties => {
  const fixedHeight = `${getMemberCardHeight()}px`;
  const fixedBox = {
    width: `${CARD_WIDTH}px`,
    height: fixedHeight,
    minHeight: fixedHeight,
    maxHeight: fixedHeight,
  };
  return Object.assign(fixedBox, {
    backgroundColor: palette.bg,
    border: "none",
    borderRadius: `${CARD_RADIUS}px`,
    boxShadow: palette.shellShadow,
    transform: "rotate(-0.65deg)",
    transformOrigin: ["center", "center"].join(" "),
  });
};

export const formatCardDate = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const options = Object.fromEntries([
    ["year", "numeric"],
    ["month", "short"],
    ["day", "numeric"],
  ]) as Intl.DateTimeFormatOptions;
  return parsed.toLocaleDateString(undefined, options);
};
