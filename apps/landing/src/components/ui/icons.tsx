/** Brand marks that sit beside a visible Looper wordmark stay decorative. */

type IconProps = {
  /** Square edge in px. */
  readonly size: number;
  readonly className?: string;
};

/** Exact geometry from assets/brand/looper-mark.svg, colored by the owning surface. */
export function LooperMark({ size, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
    >
      <path
        fill="currentColor"
        d="M10 27c0-9.389 7.611-17 17-17h19v22h22v21c0 9.389-7.611 17-17 17H27c-9.389 0-17-7.611-17-17V27Z"
      />
      <rect width="20" height="20" x="52" y="4" rx="3" fill="currentColor" />
    </svg>
  );
}
