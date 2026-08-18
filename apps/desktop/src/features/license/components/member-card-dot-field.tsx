import { Fragment, useMemo } from "react";
import { motion } from "framer-motion";
import {
  DOT_SWAP_BLINK_MS,
  DOT_SWAP_SWEEP_MS,
  STRIPE_HEIGHT,
  type MemberCardDot,
} from "./member-card-geometry";

type DotAppearance = {
  width: number;
  dotRadius: number;
  color: string;
  activeOpacity: number;
  inactiveOpacity: number;
};

type StripeDotFieldProps = DotAppearance & {
  currentDots: MemberCardDot[];
  outgoingDots: MemberCardDot[];
  isTransitioning: boolean;
  sweep: boolean;
};

const dotKey = ({ x, y }: MemberCardDot) =>
  `${Math.round(x * 10)}:${Math.round(y * 10)}`;

const opacityFor = (
  dot: MemberCardDot | undefined,
  active: number,
  inactive: number,
) => (dot ? (dot.active ? active : inactive) : 0);

const fade = (opacity: number, delay: number, ease: "easeIn" | "easeOut") => ({
  initial: { opacity: ease === "easeIn" ? 0 : opacity },
  animate: { opacity: ease === "easeIn" ? opacity : 0 },
  transition: { delay, duration: DOT_SWAP_BLINK_MS / 1_000, ease },
});

const StaticDots = ({
  dots: pattern,
  dotRadius: radius,
  color: ink,
  activeOpacity: solid,
  inactiveOpacity: faint,
}: Omit<DotAppearance, "width"> & { dots: MemberCardDot[] }) => (
  <>
    {pattern.map((dot, index) => (
      <circle
        key={index}
        {...{ cx: dot.x, cy: dot.y, r: radius, fill: ink }}
        opacity={dot.active ? solid : faint}
      />
    ))}
  </>
);

const SweepingDots = ({
  currentDots,
  outgoingDots,
  width,
  dotRadius,
  color,
  activeOpacity,
  inactiveOpacity,
}: Omit<StripeDotFieldProps, "isTransitioning" | "sweep">) => {
  const incoming = useMemo(
    () => new Map(currentDots.map((dot) => [dotKey(dot), dot])),
    [currentDots],
  );
  const outgoing = useMemo(
    () => new Map(outgoingDots.map((dot) => [dotKey(dot), dot])),
    [outgoingDots],
  );
  const keys = useMemo(
    () => Array.from(new Set([...incoming.keys(), ...outgoing.keys()])),
    [incoming, outgoing],
  );
  const sweepSeconds = DOT_SWAP_SWEEP_MS / 1_000;

  return (
    <>
      {keys.map((key) => {
        const before = outgoing.get(key);
        const after = incoming.get(key);
        const x = before?.x ?? after?.x;
        const y = before?.y ?? after?.y;
        if (x === undefined || y === undefined) return null;
        const beforeOpacity = opacityFor(
          before,
          activeOpacity,
          inactiveOpacity,
        );
        const afterOpacity = opacityFor(after, activeOpacity, inactiveOpacity);
        const dotProps = { cx: x, cy: y, r: dotRadius, fill: color };
        if (before && after && before.active === after.active) {
          return <circle key={key} {...dotProps} opacity={afterOpacity} />;
        }
        const delay = (x / width) * sweepSeconds;
        return (
          <Fragment key={key}>
            {before ? (
              <motion.circle
                {...dotProps}
                {...fade(beforeOpacity, delay, "easeOut")}
              />
            ) : null}
            {after ? (
              <motion.circle
                {...dotProps}
                {...fade(afterOpacity, delay, "easeIn")}
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
};

export const StripeDotField = (props: StripeDotFieldProps) => (
  <svg
    {...{
      width: props.width,
      height: STRIPE_HEIGHT,
      viewBox: `0 0 ${props.width} ${STRIPE_HEIGHT}`,
      xmlns: "http://www.w3.org/2000/svg",
      className: ["absolute", "inset-0"].join(" "),
    }}
  >
    {props.isTransitioning && props.sweep ? (
      <SweepingDots {...props} />
    ) : (
      <StaticDots dots={props.currentDots} {...props} />
    )}
  </svg>
);
