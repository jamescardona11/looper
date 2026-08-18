import { useLingui } from "@lingui/react/macro";
import { ArrowUpRight, CircleNotch as Loader2 } from "@phosphor-icons/react";
import { tierInfo, type PurchaseTier } from "../../license/purchaseConfig";
import { TIER_COLORS, useMemberCardPalette } from "./memberCardShared";

type MemberCardTierPickerProps = {
  previewTier: PurchaseTier | null;
  openingTarget: PurchaseTier | null;
  disabled: boolean;
  onPreview: (tier: PurchaseTier) => void;
  onPurchase: (tier: PurchaseTier) => void;
};

const pickerClass = {
  root: ["absolute inset-0 flex", "items-stretch gap-0"].join(" "),
  divider: ["mx-1.5 my-1.5", "w-px shrink-0"].join(" "),
  choice: [
    "group flex min-w-0 flex-1 items-center justify-between gap-1.5",
    "border-0 bg-transparent py-1.5 text-left",
    "disabled:opacity-50",
  ].join(" "),
  labelGroup: ["flex min-w-0", "items-center gap-2"].join(" "),
  marker: ["shrink", "0"].join("-"),
  label: ["truncate font-mono", "uppercase tracking-[0.05em]"].join(" "),
  spinner: ["shrink-0", "animate-spin"].join(" "),
  arrow: ["shrink-0 transition-opacity", "group-hover:opacity-100"].join(" "),
} as const;

const markerVisual = (
  selected: boolean,
  accent: { fg: string },
  muted: string,
) => ({
  width: "8px",
  height: "8px",
  border: `1px solid ${selected ? accent.fg : muted}`,
  backgroundColor: selected ? accent.fg : "transparent",
  opacity: selected ? 0.88 : 0.45,
});

const labelVisual = (selected: boolean, ink: string) => ({
  fontSize: "10px",
  fontWeight: 600,
  textDecoration: selected ? "underline" : "none",
  textUnderlineOffset: "3px",
  textDecorationColor: selected
    ? `color-mix(in srgb, ${ink} 70%, transparent)`
    : undefined,
});

export const MemberCardTierPicker = (props: MemberCardTierPickerProps) => {
  const colors = useMemberCardPalette();
  return (
    <div className={pickerClass.root}>
      <TierChoice tier="personal" {...props} />
      <div
        aria-hidden="true"
        className={pickerClass.divider}
        style={{
          backgroundImage: [
            "repeating-linear-gradient(to bottom",
            `${colors.border} 0`,
            `${colors.border} 2px`,
            "transparent 2px",
            "transparent 5px)",
          ].join(", "),
        }}
      />
      <TierChoice tier="commercial" {...props} />
    </div>
  );
};

const TierChoice = ({
  tier: option,
  previewTier: preview,
  openingTarget: target,
  disabled: checkoutBlocked,
  onPreview: previewChoice,
  onPurchase: purchaseChoice,
}: MemberCardTierPickerProps & { tier: PurchaseTier }) => {
  const { t } = useLingui();
  const palette = useMemberCardPalette();
  const info = tierInfo(option);
  const accent = TIER_COLORS[option];
  const highlighted = preview === option || target === option;
  const opening = target === option;
  const pickerLabel = info.pickerPrice
    ? `${info.label} · ${info.pickerPrice}`
    : info.label;
  const markerStyle = markerVisual(highlighted, accent, palette.textDisabled);
  const textStyle = labelVisual(highlighted, accent.fg);
  return (
    <button
      type="button"
      onClick={() => purchaseChoice(option)}
      onMouseEnter={() => previewChoice(option)}
      disabled={checkoutBlocked && !opening}
      aria-label={t({
        id: "member_card.tier_purchase_aria",
        message: `Purchase ${info.label} for ${info.price}`,
      })}
      className={pickerClass.choice}
      style={{ color: highlighted ? accent.fg : palette.textPrimary }}
    >
      <span className={pickerClass.labelGroup}>
        <span
          aria-hidden="true"
          className={pickerClass.marker}
          style={markerStyle}
        />
        <span className={pickerClass.label} style={textStyle}>
          {pickerLabel}
        </span>
      </span>
      {opening ? (
        <Loader2
          size={11}
          className={pickerClass.spinner}
          style={{ color: accent.fg }}
        />
      ) : (
        <ArrowUpRight
          size={11}
          className={pickerClass.arrow}
          style={{ color: accent.fg, opacity: highlighted ? 0.85 : 0.45 }}
          aria-hidden="true"
        />
      )}
    </button>
  );
};
