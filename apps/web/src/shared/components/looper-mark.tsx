type LooperMarkProps = {
  className?: string;
  decorative?: boolean;
};

export function LooperMark({ className, decorative = true }: LooperMarkProps) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Looper"}
      role={decorative ? undefined : "img"}
    >
      <path
        fill="currentColor"
        d="M10 27c0-9.389 7.611-17 17-17h19v22h22v21c0 9.389-7.611 17-17 17H27c-9.389 0-17-7.611-17-17V27Z"
      />
      <rect width="20" height="20" x="52" y="4" rx="3" fill="currentColor" />
    </svg>
  );
}
