export type PurchaseTier = "personal" | "commercial";
export type PurchaseSource = "onboarding" | "settings_account";

export type TierInfo = {
  id: PurchaseTier;
  label: string;
  price: string;
  pickerPrice?: string;
  blurb: string;
};

const PURCHASE_TIERS: Record<PurchaseTier, TierInfo> = {
  personal: {
    id: "personal",
    label: "Personal",
    price: "$24.99",
    pickerPrice: "$24.99",
    blurb: "For yourself. A one-time purchase, on up to 5 of your own devices.",
  },
  commercial: {
    id: "commercial",
    label: "Commercial",
    price: "$48/seat/year",
    pickerPrice: "per seat",
    blurb:
      "For paid work. One seat per person on one work device, billed yearly. Volume discounts for teams.",
  },
};

export function tierInfo(tier: PurchaseTier): TierInfo {
  return { ...PURCHASE_TIERS[tier] };
}
