import type { CSSProperties } from "react";
import { useMemberCardPalette } from "./member-card-palette";

export const STAMP_LAYER_CLASS = [
  "absolute inset-0",
  "flex items-center justify-end",
  "origin-[85%_70%]",
].join(" ");

const stampBox = {
  borderRadius: ["6px", "2px", "6px", "2px"].join(" "),
  padding: ["4px", "10px"].join(" "),
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  lineHeight: 1,
} satisfies CSSProperties;

const buildStampStyle = (ink: string, paper: string): CSSProperties =>
  Object.assign({}, stampBox, {
    color: ink,
    backgroundColor: paper,
    border: `1.5px dashed color-mix(in srgb, ${ink} 50%, transparent)`,
  });

export const TierStamp = ({
  label: caption,
  color: ink,
  bg: paper,
}: {
  label: string;
  color: string;
  bg: string;
}) => {
  const stampStyle = buildStampStyle(ink, paper);
  const shadowStyle = Object.assign({}, stampStyle, {
    position: "absolute",
    top: "0.8px",
    left: "0.6px",
    opacity: 0.38,
    filter: "blur(0.45px)",
    pointerEvents: "none",
  } satisfies CSSProperties);
  return (
    <span
      className={["relative", "inline-flex", "shrink-0"].join(" ")}
      style={{ transform: "rotate(3deg)" }}
    >
      <span aria-hidden="true" style={shadowStyle}>
        {caption}
      </span>
      <span style={stampStyle}>{caption}</span>
    </span>
  );
};

export const Detail = ({
  label: term,
  value: reading,
  wide: spansColumns = false,
  muted: subdued = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  muted?: boolean;
}) => {
  const colors = useMemberCardPalette();
  const definitionClass = ["min-w-0", spansColumns && "col-span-2"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={definitionClass}>
      <dt
        className={["font-mono", "uppercase", "tracking-[0.16em]"].join(" ")}
        style={Object.assign(
          { fontSize: "9.5px", fontWeight: 600 },
          { color: colors.textDisabled },
        )}
      >
        {term}
      </dt>
      <dd
        className={["mt-1", "truncate", "font-mono"].join(" ")}
        style={Object.assign(
          { fontSize: "13px", fontWeight: 500 },
          { color: subdued ? colors.textDisabled : colors.textPrimary },
        )}
      >
        {reading}
      </dd>
    </div>
  );
};
