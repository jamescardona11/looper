import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import DotMatrix from "../../../shared/ui/DotMatrix";

const CARD_WIDTH = 300;
const SIGNAL_ROWS = 13;
export const WAVE_COLS = 44;
const SIGNAL_MIDDLE = Math.floor(SIGNAL_ROWS / 2);

const advanceSeed = (seed: number): number => {
  let next = seed || 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
};

const seedFromText = (value: string): number => {
  let seed = 5381;
  for (const character of value) {
    seed = (Math.imul(seed, 33) ^ character.codePointAt(0)!) >>> 0;
  }
  return seed;
};

export const waveDots = (identity: string): number[] => {
  const activeDots: number[] = [];
  let seed = seedFromText(identity);
  let previousHeight = 1;

  for (let column = 0; column < WAVE_COLS; column += 1) {
    seed = advanceSeed(seed + column);
    const targetHeight = 1 + (seed % (SIGNAL_MIDDLE + 1));
    const height = Math.round((previousHeight + targetHeight) / 2);
    previousHeight = height;
    const centerOffset = ((seed >>> 8) % 3) - 1;
    const center = SIGNAL_MIDDLE + centerOffset;
    const firstRow = Math.max(0, center - height);
    const lastRow = Math.min(SIGNAL_ROWS - 1, center + height);

    for (let row = firstRow; row <= lastRow; row += 1) {
      activeDots.push(row * WAVE_COLS + column);
    }
  }

  return activeDots;
};

type ModelCardShellProps = {
  accent: string;
  glowStrong: string;
  glowSoft: string;
  dots: number[];
  animated?: boolean;
  ariaLabel: string;
  width?: number;
  onClick?: () => void;
  selected?: boolean;
  children: ReactNode;
};

const keyboardActivation = (
  event: KeyboardEvent<HTMLElement>,
  activate: () => void,
) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
};

const ModelCardShell = ({
  accent,
  glowStrong,
  glowSoft,
  dots,
  animated = false,
  ariaLabel,
  width = CARD_WIDTH,
  onClick,
  selected,
  children,
}: ModelCardShellProps) => {
  const interactiveAttributes = onClick
    ? {
        role: selected === undefined ? "button" : "radio",
        tabIndex: 0,
        onClick,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) =>
          keyboardActivation(event, onClick),
        ...(selected === undefined ? {} : { "aria-checked": selected }),
      }
    : {};
  const cardStyle: CSSProperties = {
    width,
    borderColor: selected ? accent : "var(--model-card-border)",
    boxShadow: selected
      ? `0 0 0 2px color-mix(in srgb, ${accent} 22%, transparent), var(--model-card-shadow)`
      : "var(--model-card-shadow)",
  };

  return (
    <article
      aria-label={ariaLabel}
      {...interactiveAttributes}
      className={`group relative overflow-hidden rounded-[18px] border bg-surface-surface text-left ${
        onClick
          ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cloud)]"
          : ""
      }`}
      style={cardStyle}
    >
      <div
        aria-hidden="true"
        className="relative grid h-[92px] place-items-center overflow-hidden"
        style={{
          background: `linear-gradient(155deg, ${glowStrong} 0%, ${glowSoft} 42%, transparent 78%)`,
        }}
      >
        <div
          className="absolute inset-x-5 inset-y-1 grid place-items-center opacity-95"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, black 14%, black 86%, transparent)",
          }}
        >
          <DotMatrix
            rows={SIGNAL_ROWS}
            cols={WAVE_COLS}
            activeDots={dots}
            dotSize={3}
            gap={5}
            color={accent}
            animated={animated}
          />
        </div>
        <div
          className="absolute inset-x-8 bottom-2 h-px opacity-50"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          }}
        />
      </div>
      {children}
    </article>
  );
};

export default ModelCardShell;
