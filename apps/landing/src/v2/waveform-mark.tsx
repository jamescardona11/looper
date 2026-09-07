type IconProps = {
  /** Square edge in px. The artboards use 15, 17, 18, 19 and 22 across the page. */
  readonly size: number;
  readonly className?: string;
};

/** The Looper wordmark glyph: five bars, a waveform frozen mid-utterance. */
export function WaveformMark({ size, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <path d="M4 12v-1" />
      <path d="M8 16V8" />
      <path d="M12 20V4" />
      <path d="M16 16V8" />
      <path d="M20 13v-2" />
    </svg>
  );
}
