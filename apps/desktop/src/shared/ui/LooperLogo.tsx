import looperMarkUrl from "../../../../../assets/brand/looper-mark.svg?url";
import looperLogoUrl from "../../../../../assets/brand/looper-logo.svg?url";

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
    <span
      aria-label="Looper"
      role="img"
      className="block shrink-0 bg-current"
      style={{
        backgroundColor: "currentColor",
        height: dimension,
        maskImage: `url("${looperMarkUrl}")`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url("${looperMarkUrl}")`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        width: dimension,
      }}
    />
  );
};

export const LooperWordmark = ({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) => (
  <span
    {...(decorative
      ? { "aria-hidden": true }
      : { "aria-label": "Looper", role: "img" })}
    className={`block shrink-0 bg-current ${className}`}
    style={{
      backgroundColor: "currentColor",
      maskImage: `url("${looperLogoUrl}")`,
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskImage: `url("${looperLogoUrl}")`,
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
    }}
  />
);
