import { useMemo, useState } from "react";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import { buildStripeDots } from "./member-card-dot-pattern";
import { StripeDotField } from "./member-card-dot-field";
import {
  CARD_PADDING,
  CARD_STRIPE_DENSITY,
  CARD_STRIPE_GAP,
  CARD_WIDTH,
  DOT_SWAP_TOTAL_MS,
  STRIPE_CORNER_RADIUS,
  STRIPE_DIVIDER_OFFSET,
  STRIPE_DOT_SIZE,
  STRIPE_HEIGHT,
  type StripeDotTransitionMode,
} from "./member-card-geometry";
import { useMemberCardPalette } from "./member-card-palette";

type SeedTransition = { incoming: string; outgoing: string | null };

const stripeClass = {
  frame: ["relative", "shrink-0"].join(" "),
  divider: ["pointer-events-none absolute inset-x-0", "z-[2]"].join(" "),
};

const stripeBox = (background: string) =>
  Object.fromEntries([
    ["marginLeft", `${-CARD_PADDING}px`],
    ["marginRight", `${-CARD_PADDING}px`],
    ["marginTop", `${CARD_STRIPE_GAP}px`],
    ["width", `${CARD_WIDTH}px`],
    ["height", `${STRIPE_HEIGHT}px`],
    ["backgroundColor", background],
    ["borderBottomLeftRadius", `${STRIPE_CORNER_RADIUS}px`],
    ["borderBottomRightRadius", `${STRIPE_CORNER_RADIUS}px`],
    ["overflow", "hidden"],
  ]);

const SeedChangeCoordinator = ({
  seedKey: requestedSeed,
  enabled: animateSwap,
  currentSeed: displayedSeed,
  onChange: replaceSeeds,
}: {
  seedKey: string;
  enabled: boolean;
  currentSeed: string;
  onChange: (transition: SeedTransition) => void;
}) => {
  useMountEffect(() => {
    if (requestedSeed !== displayedSeed) {
      replaceSeeds({
        incoming: requestedSeed,
        outgoing: animateSwap ? displayedSeed : null,
      });
    }
  });
  return null;
};

const TransitionDeadline = ({ onExpire: finish }: { onExpire: () => void }) => {
  useMountEffect(() => {
    const timerId = window.setTimeout(finish, DOT_SWAP_TOTAL_MS);
    return () => window.clearTimeout(timerId);
  });
  return null;
};

export const MemberCardStripe = ({
  seedKey: requestedSeed,
  transitionMode: mode = "none",
  density: fillRatio = CARD_STRIPE_DENSITY,
}: {
  seedKey: string;
  transitionMode?: StripeDotTransitionMode;
  density?: number;
}) => {
  const palette = useMemberCardPalette();
  const [seeds, setSeeds] = useState<SeedTransition>({
    incoming: requestedSeed,
    outgoing: null,
  });
  const sweep = mode === "sweep";
  const currentDots = useMemo(
    () => buildStripeDots(sweep ? seeds.incoming : requestedSeed, fillRatio),
    [fillRatio, requestedSeed, seeds.incoming, sweep],
  );
  const outgoingDots = useMemo(
    () => (seeds.outgoing ? buildStripeDots(seeds.outgoing, fillRatio) : []),
    [fillRatio, seeds.outgoing],
  );
  const stripeStyle = stripeBox(palette.stripeBg);
  const dotField = {
    currentDots,
    outgoingDots,
    isTransitioning: seeds.outgoing !== null,
    sweep,
    width: CARD_WIDTH,
    dotRadius: STRIPE_DOT_SIZE / 2,
    color: palette.dotColor,
    activeOpacity: 1,
    inactiveOpacity: 0.2,
  };

  return (
    <div aria-hidden="true" className={stripeClass.frame} style={stripeStyle}>
      <SeedChangeCoordinator
        key={`${requestedSeed}:${sweep}`}
        seedKey={requestedSeed}
        enabled={sweep}
        currentSeed={seeds.incoming}
        onChange={setSeeds}
      />
      {seeds.outgoing ? (
        <TransitionDeadline
          key={`${seeds.outgoing}:${seeds.incoming}`}
          onExpire={() => setSeeds((value) => ({ ...value, outgoing: null }))}
        />
      ) : null}
      <svg
        {...{
          width: CARD_WIDTH,
          height: 3,
          viewBox: `0 0 ${CARD_WIDTH} 3`,
        }}
        xmlns={["http://www.w3.org", "2000/svg"].join("/")}
        className={stripeClass.divider}
        style={{ top: `${STRIPE_DIVIDER_OFFSET}px` }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          {...{ x1: 0, y1: 1.5, x2: CARD_WIDTH, y2: 1.5 }}
          stroke={palette.border}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeLinecap="butt"
        />
      </svg>
      <StripeDotField {...dotField} />
    </div>
  );
};
