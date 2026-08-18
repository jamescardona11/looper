const PURCHASE_TIER_IDS = ["personal", "commercial"] as const;
const PURCHASE_SOURCE_IDS = ["onboarding", "settings_account"] as const;

export type PurchaseTier = (typeof PURCHASE_TIER_IDS)[number];
export type PurchaseSource = (typeof PURCHASE_SOURCE_IDS)[number];

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
