import { useMemo } from "react";
import { seedFromLicenseKey } from "../licenseFingerprint";
import { buildSecurityDots } from "./member-card-dot-pattern";
import {
  CARD_RADIUS,
  CARD_WIDTH,
  SECURITY_DOT_SIZE,
} from "./member-card-geometry";
import { useMemberCardPalette } from "./member-card-palette";

type PaperPalette = ReturnType<typeof useMemberCardPalette>;

const overlayClass = [
  "pointer-events-none",
  "absolute inset-0",
  "overflow-hidden",
].join(" ");
const svgClass = ["absolute", "inset-0"].join(" ");

const SecurityDotsSvg = ({
  dots,
  cardHeight,
  palette,
}: {
  dots: ReturnType<typeof buildSecurityDots>;
  cardHeight: number;
  palette: PaperPalette;
}) => (
  <svg
    {...{
      width: CARD_WIDTH,
      height: cardHeight,
      viewBox: `0 0 ${CARD_WIDTH} ${cardHeight}`,
      xmlns: "http://www.w3.org/2000/svg",
      className: svgClass,
    }}
  >
    {dots.map(({ x, y, active }, index) => (
      <circle
        key={index}
        {...{ cx: x, cy: y, r: SECURITY_DOT_SIZE / 2 }}
        fill={palette.dotColor}
        opacity={palette.securityDotOpacity * (active ? 1 : 0.35)}
      />
    ))}
  </svg>
);

const PaperGrainSvg = ({
  cardHeight,
  noiseSeed,
  filterId,
  opacity,
}: {
  cardHeight: number;
  noiseSeed: number;
  filterId: string;
  opacity: number;
}) => (
  <svg
    {...{
      width: CARD_WIDTH,
      height: cardHeight,
      className: svgClass,
      xmlns: "http://www.w3.org/2000/svg",
    }}
  >
    <defs>
      <filter
        {...{
          id: filterId,
          x: "0%",
          y: "0%",
          width: "100%",
          height: "100%",
        }}
      >
        <feTurbulence
          {...{
            type: "fractalNoise",
            baseFrequency: "0.92",
            numOctaves: "4",
            seed: noiseSeed,
            stitchTiles: "stitch",
          }}
        />
      </filter>
    </defs>
    <rect
      {...{
        width: CARD_WIDTH,
        height: cardHeight,
        filter: `url(#${filterId})`,
        opacity,
      }}
    />
  </svg>
);

export const MemberCardPaperOverlays = ({
  seedKey,
  cardHeight,
}: {
  seedKey: string;
  cardHeight: number;
}) => {
  const palette = useMemberCardPalette();
  const dots = useMemo(
    () => buildSecurityDots(seedKey, cardHeight),
    [cardHeight, seedKey],
  );
  const noiseSeed = seedFromLicenseKey(`${seedKey}:grain`) % 997;
  const noiseFilterId = `member-card-noise-${noiseSeed}`;
  return (
    <div
      aria-hidden="true"
      className={overlayClass}
      style={{ borderRadius: `${CARD_RADIUS}px` }}
    >
      <SecurityDotsSvg {...{ dots, cardHeight, palette }} />
      <PaperGrainSvg
        {...{
          cardHeight,
          noiseSeed,
          filterId: noiseFilterId,
          opacity: palette.noiseOpacity,
        }}
      />
      <div
        className={svgClass}
        style={Object.fromEntries([
          ["boxShadow", palette.vignette],
          ["borderRadius", `${CARD_RADIUS}px`],
        ])}
      />
    </div>
  );
};
