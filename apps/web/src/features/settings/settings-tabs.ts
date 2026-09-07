export type SettingsTab = "profile" | "subscription" | "keys" | "language";

// Keep the billing implementation available while the product is presented as free.
export const SHOW_SUBSCRIPTION_SETTINGS = false;

const SETTINGS_TABS = new Set<SettingsTab>([
  "profile",
  "keys",
  "language",
  ...(SHOW_SUBSCRIPTION_SETTINGS ? ["subscription" as const] : []),
]);

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && SETTINGS_TABS.has(value as SettingsTab);
}
