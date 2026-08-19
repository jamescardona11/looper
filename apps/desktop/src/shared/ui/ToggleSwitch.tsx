import { useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";

type ToggleSwitchSize = "xs" | "sm" | "md";

type ToggleSwitchProps = {
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
  disabled?: boolean;
  size?: ToggleSwitchSize;
};

const SIZES = {
  xs: { width: 24, height: 14, thumb: 10, inset: 2 },
  sm: { width: 28, height: 16, thumb: 12, inset: 2 },
  md: { width: 40, height: 20, thumb: 16, inset: 2 },
} as const;

const TRACK = [
  "relative inline-block shrink-0 align-middle",
  "rounded-full border-0 p-0 appearance-none leading-none",
  "transition-colors duration-150",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-hover",
].join(" ");

function switchView(
  enabled: boolean,
  disabled: boolean,
  size: ToggleSwitchSize,
  reduceMotion: boolean,
) {
  const geometry = SIZES[size];
  const track: CSSProperties = {
    width: geometry.width,
    minWidth: geometry.width,
    height: geometry.height,
    minHeight: geometry.height,
    boxSizing: "border-box",
  };
  const thumb: CSSProperties = {
    top: geometry.inset,
    left: geometry.inset,
    width: geometry.thumb,
    height: geometry.thumb,
    borderRadius: "9999px",
    backfaceVisibility: "hidden",
    transform: `translateX(${enabled ? geometry.width - geometry.thumb - geometry.inset * 2 : 0}px)`,
    transition: reduceMotion
      ? "none"
      : "transform 180ms cubic-bezier(0.16, 1, 0.3, 1)",
  };
  const stateClass = enabled
    ? "bg-[var(--color-toggle-on)]"
    : "bg-[var(--color-border-secondary)]";
  const abilityClass = disabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";
  return { track, thumb, className: `${TRACK} ${stateClass} ${abilityClass}` };
}

export default function ToggleSwitch({
  enabled,
  onToggle,
  ariaLabel,
  disabled = false,
  size = "sm",
}: ToggleSwitchProps) {
  const view = switchView(enabled, disabled, size, Boolean(useReducedMotion()));
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={view.className}
      style={view.track}
    >
      <span
        className="absolute block rounded-full bg-white shadow-sm"
        style={view.thumb}
      />
    </button>
  );
}
