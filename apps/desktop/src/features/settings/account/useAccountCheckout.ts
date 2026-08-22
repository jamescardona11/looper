import { useReducer } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PurchaseTier } from "../../license/purchaseConfig";
import {
  EMPTY_ACCOUNT_CHECKOUT_STATE,
  openAccountCheckout,
  reduceAccountCheckout,
} from "./account-checkout-policy";

export function useAccountCheckout() {
  const [state, dispatch] = useReducer(
    reduceAccountCheckout,
    EMPTY_ACCOUNT_CHECKOUT_STATE,
  );

  const openCheckout = async (tier: PurchaseTier) => {
    dispatch({ type: "opening", tier });
    const checkoutError = await openAccountCheckout(tier, openUrl);
    dispatch({ type: "settled", error: checkoutError });
  };

  return { ...state, openCheckout };
}
