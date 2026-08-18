export type SettingsSection =
  | "account"
  | "sync"
  | "processing"
  | "microphone"
  | "shortcuts"
  | "behavior"
  | "providers"
  | "appearance"
  | "calendar"
  | "privacy"
  | "storage"
  | "about";

export type SettingsTab =
  "general" | "account" | "sync" | "models" | "providers" | "about" | "app";

export const settingsSectionTab: Record<SettingsSection, SettingsTab> = {
  account: "account",
  sync: "sync",
  processing: "general",
  microphone: "general",
  shortcuts: "general",
  behavior: "general",
  providers: "providers",
  appearance: "app",
  calendar: "app",
  privacy: "app",
  storage: "app",
  about: "about",
};

export const initialSettingsSection: Record<SettingsTab, SettingsSection> = {
  account: "account",
  sync: "sync",
  general: "processing",
  models: "processing",
  providers: "providers",
  app: "appearance",
  about: "about",
};
