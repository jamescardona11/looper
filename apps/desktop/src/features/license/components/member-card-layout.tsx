import type { ReactNode } from "react";
import {
  CARD_DETAILS_HEIGHT,
  CARD_HEADER_HEIGHT,
  CARD_HEADLINE_GAP,
  CARD_HEADLINE_HEIGHT,
  CARD_HEADLINE_OVERLAP,
  CARD_INNER_WIDTH,
  CARD_STAMP_SLOT_HEIGHT,
  CARD_STAMP_SLOT_WIDTH,
  MEMBER_CARD_LAYOUT_ID,
} from "./member-card-geometry";
import { useMemberCardPalette } from "./member-card-palette";

const wordmarkMetrics = {
  fontSize: "10px",
  fontWeight: 700,
  lineHeight: 1.35,
} as const;
const wordmarkClass = ["font-mono", "uppercase", "tracking-[0.24em]"].join(" ");
const layoutClass = {
  stamp: ["relative", "shrink-0", "overflow-visible"].join(" "),
  header: [
    "relative flex shrink-0",
    "items-start justify-end",
    "overflow-visible",
  ].join(" "),
  wordmarkRegion: [
    "pointer-events-none absolute left-0",
    "min-w-0 max-w-[58%]",
  ].join(" "),
  price: ["mt-1.5 truncate font-mono", "tabular-nums tracking-[0.02em]"].join(
    " ",
  ),
  headline: ["flex min-w-0 shrink-0", "flex-col overflow-hidden"].join(" "),
  details: ["mt-2 shrink-0", "grid grid-cols-2 gap-x-6 gap-y-2"].join(" "),
  frame: ["relative z-[1]", "flex flex-col", "p-5 pb-0"].join(" "),
} as const;

const px = (value: number) => `${value}px`;

export const CardWordmark = () => {
  const colors = useMemberCardPalette();
  return (
    <p
      className={wordmarkClass}
      style={{
        ...wordmarkMetrics,
        color: colors.textDisabled,
        textShadow: colors.wordmarkShadow,
      }}
    >
      Looper
    </p>
  );
};

export const CardStampSlot = ({ children }: { children: ReactNode }) => (
  <div
    className={layoutClass.stamp}
    style={Object.fromEntries([
      ["width", px(CARD_STAMP_SLOT_WIDTH)],
      ["height", px(CARD_STAMP_SLOT_HEIGHT)],
    ])}
  >
    {children}
  </div>
);

export const CardHeaderRow = ({
  stamp,
  price,
  priceColor,
}: {
  stamp: ReactNode;
  price?: string | null;
  priceColor?: string;
}) => {
  const colors = useMemberCardPalette();
  return (
    <div
      className={layoutClass.header}
      style={{ height: px(CARD_HEADER_HEIGHT) }}
    >
      <div className={layoutClass.wordmarkRegion} style={{ top: "-11px" }}>
        <CardWordmark />
        {price && priceColor ? (
          <p
            className={layoutClass.price}
            style={Object.assign(
              { fontSize: "13px", fontWeight: 600, lineHeight: 1.2 },
              { color: priceColor, textShadow: colors.wordmarkShadow },
            )}
          >
            {price}
          </p>
        ) : null}
      </div>
      <CardStampSlot>{stamp}</CardStampSlot>
    </div>
  );
};

export const CardHeadlineBlock = ({
  title: primary,
  subtitle: secondary,
  height: blockHeight = CARD_HEADLINE_HEIGHT,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  height?: number;
}) => (
  <div
    className={layoutClass.headline}
    style={Object.fromEntries([
      ["marginTop", px(-CARD_HEADLINE_OVERLAP)],
      ["gap", px(CARD_HEADLINE_GAP)],
      ["height", px(blockHeight)],
    ])}
  >
    <div className={["min-w", "0"].join("-")}>{primary}</div>
    <div className={["min-w", "0"].join("-")}>{secondary}</div>
  </div>
);

export const CardDetailsGrid = ({
  children: definitions,
  height: blockHeight = CARD_DETAILS_HEIGHT,
}: {
  children: ReactNode;
  height?: number;
}) => (
  <dl className={layoutClass.details} style={{ height: px(blockHeight) }}>
    {definitions}
  </dl>
);

export const CardDottedRule = () => {
  const colors = useMemberCardPalette();
  const canvas = {
    width: CARD_INNER_WIDTH,
    height: 2,
    viewBox: `0 0 ${CARD_INNER_WIDTH} 2`,
  };
  const dash = {
    stroke: colors.border,
    strokeWidth: 1,
    strokeDasharray: "2 5",
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      {...canvas}
      aria-hidden="true"
      className={["block", "w-full"].join(" ")}
      preserveAspectRatio="none"
    >
      <line {...{ x1: 0, y1: 1, x2: CARD_INNER_WIDTH, y2: 1 }} {...dash} />
    </svg>
  );
};

export const MemberCardFrame = ({
  children: contents,
  layoutId = MEMBER_CARD_LAYOUT_ID,
}: {
  children: ReactNode;
  layoutId?: string;
}) => {
  void layoutId;
  return <div className={layoutClass.frame}>{contents}</div>;
};
