export type PurchaseTier = "personal" | "commercial";
export type PurchaseSource = "onboarding" | "settings_account";

type TierSpecification = readonly [
  label: string,
  price: string,
  pickerPrice: string | undefined,
  blurbParts: readonly string[],
];

const TIER_SPECIFICATIONS = {
  personal: [
    "Personal",
    "$24.99",
    "$24.99",
    ["For yourself.", "A one-time purchase, on up to 5 of your own devices."],
  ],
  commercial: [
    "Commercial",
    "$48/seat/year",
    "per seat",
    [
      "For paid work.",
      "One seat per person on one work device, billed yearly.",
      "Volume discounts for teams.",
    ],
  ],
} satisfies Record<PurchaseTier, TierSpecification>;

function materializeTier(
  id: PurchaseTier,
  [label, price, pickerPrice, blurbParts]: TierSpecification,
) {
  return {
    id,
    label,
    price,
    pickerPrice,
    blurb: blurbParts.join(" "),
  };
}

export type TierInfo = ReturnType<typeof materializeTier>;

export function tierInfo(tier: PurchaseTier): TierInfo {
  return materializeTier(tier, TIER_SPECIFICATIONS[tier]);
}
