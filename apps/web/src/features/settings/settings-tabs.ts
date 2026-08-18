export type SettingsTab = "profile" | "subscription" | "keys" | "language" | "appearance";

const SETTINGS_TABS = new Set<SettingsTab>([
  "profile",
  "subscription",
  "keys",
  "language",
  "appearance",
]);

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && SETTINGS_TABS.has(value as SettingsTab);
}
