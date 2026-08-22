import {
  checkoutUrlFor,
  type PurchaseTier,
} from "../../license/purchaseConfig";

type UrlOpener = (url: string) => Promise<unknown>;

export type AccountCheckoutState = Readonly<{
  openingTarget: PurchaseTier | null;
  error: string | null;
}>;

export type AccountCheckoutEvent =
  | { type: "opening"; tier: PurchaseTier }
  | { type: "settled"; error: string | null };

export const EMPTY_ACCOUNT_CHECKOUT_STATE: AccountCheckoutState = {
  openingTarget: null,
  error: null,
};

export function reduceAccountCheckout(
  _state: AccountCheckoutState,
  event: AccountCheckoutEvent,
): AccountCheckoutState {
  if (event.type === "opening") {
    return { openingTarget: event.tier, error: null };
  }
  return { openingTarget: null, error: event.error };
}

function missingCheckoutMessage(tier: PurchaseTier): string {
  const label = tier === "commercial" ? "Commercial" : "Personal";
  return `${label} checkout link is not configured for this build.`;
}

export async function openAccountCheckout(
  tier: PurchaseTier,
  openUrl: UrlOpener,
): Promise<string | null> {
  try {
    const url = checkoutUrlFor(tier, "settings_account");
    if (!url) return missingCheckoutMessage(tier);
    await openUrl(url);
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : String(reason);
  }
}
