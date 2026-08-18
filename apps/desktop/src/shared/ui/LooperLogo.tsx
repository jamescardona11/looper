type LooperLogoSize = "sm" | "md" | "lg" | "xl";

const LOOPER_LOGO_SIZES: Record<LooperLogoSize, number> = {
  sm: 16,
  md: 24,
  lg: 36,
  xl: 52,
};

export const LooperLogo = ({ size = "md" }: { size?: LooperLogoSize }) => {
  const dimension = LOOPER_LOGO_SIZES[size];

  return (
    <svg
      aria-label="Looper"
      role="img"
      width={dimension}
      height={dimension}
      viewBox="0 0 80 80"
      className="shrink-0 text-current"
    >
      <path
        fill="currentColor"
        d="M10 27c0-9.389 7.611-17 17-17h19v22h22v21c0 9.389-7.611 17-17 17H27c-9.389 0-17-7.611-17-17V27Z"
      />
      <rect width="20" height="20" x="52" y="4" rx="3" fill="currentColor" />
    </svg>
  );
};
