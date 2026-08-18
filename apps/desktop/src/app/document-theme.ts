import type { ThemeMode } from "../types";

export function parseThemePreference(value: string | null): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function themeForDocument(
  mode: ThemeMode,
  systemPrefersLight: boolean,
): "light" | "dark" {
  if (mode !== "system") return mode;
  return systemPrefersLight ? "light" : "dark";
}
