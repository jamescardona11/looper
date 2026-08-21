import { openUrl as openExternalDestination } from "@tauri-apps/plugin-opener";

import {
  customerPortalUrlFor as resolveTrackedPortal,
  type PurchaseSource as CustomerPortalSource,
} from "../purchaseConfig";

export type { CustomerPortalSource };

export function resolveCustomerPortal(source: CustomerPortalSource) {
  return resolveTrackedPortal(source);
}

export async function launchCustomerPortal(destination: string) {
  try {
    await openExternalDestination(destination);
    return true;
  } catch (error) {
    console.error("Failed to open customer portal:", error);
    return false;
  }
}
