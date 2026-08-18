import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkoutUrlFor, type PurchaseTier } from "../license/purchaseConfig";

const checkoutError = (tier: PurchaseTier): string =>
  `${tier === "commercial" ? "Commercial" : "Personal"} checkout link is not configured for this build.`;

export function useAccountCheckout() {
  const [openingTarget, setOpeningTarget] = useState<PurchaseTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = async (tier: PurchaseTier) => {
    setError(null);
    setOpeningTarget(tier);
    try {
      const checkoutUrl = checkoutUrlFor(tier, "settings_account");
      if (!checkoutUrl) throw new Error(checkoutError(tier));
      await openUrl(checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOpeningTarget(null);
    }
  };

  return { openingTarget, error, openCheckout };
}
