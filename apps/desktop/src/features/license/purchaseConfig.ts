import type {
  PurchaseSource,
  PurchaseTier,
} from "../../shared/lib/purchaseConfig";

export type { PurchaseSource, PurchaseTier };
export { tierInfo } from "../../shared/lib/purchaseConfig";

type PurchaseDestination = PurchaseTier | "customer_portal";

const CAMPAIGN_BY_DESTINATION: Record<PurchaseDestination, string> = {
  personal: "personal_license",
  commercial: "commercial_license",
  customer_portal: "customer_portal",
};

function configuredDestination(destination: PurchaseDestination) {
  const raw =
    destination === "personal"
      ? import.meta.env.VITE_LOOPER_PERSONAL_CHECKOUT_URL
      : destination === "commercial"
        ? import.meta.env.VITE_LOOPER_COMMERCIAL_CHECKOUT_URL
        : import.meta.env.VITE_LOOPER_CUSTOMER_PORTAL;
  return raw?.trim() || null;
}

export function personalCheckoutUrl() {
  return configuredDestination("personal");
}

export function commercialCheckoutUrl() {
  return configuredDestination("commercial");
}

export function customerPortalUrl() {
  return configuredDestination("customer_portal");
}

function trackedPurchaseUrl(
  destination: PurchaseDestination,
  source: PurchaseSource,
) {
  const rawUrl = configuredDestination(destination);
  if (rawUrl === null) return null;

  try {
    const url = new URL(rawUrl);
    const tracking = {
      utm_source: "looper_app",
      utm_medium: "desktop",
      utm_campaign: CAMPAIGN_BY_DESTINATION[destination],
      utm_content: source,
    };
    for (const [key, value] of Object.entries(tracking)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function checkoutUrlFor(tier: PurchaseTier, source: PurchaseSource) {
  return trackedPurchaseUrl(tier, source);
}

export function customerPortalUrlFor(source: PurchaseSource) {
  return trackedPurchaseUrl("customer_portal", source);
}
