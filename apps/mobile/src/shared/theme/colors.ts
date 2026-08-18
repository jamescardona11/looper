/**
 * Tokens oscuros de apps/desktop/src/app/App.css.
 *
 * React Native no puede consumir las variables CSS de Tauri directamente, así
 * que este mapa mantiene los mismos roles y valores para el shell móvil.
 */
export const colors = {
  background: "#141519",
  backgroundSecondary: "#191a20",
  surfaceMuted: "#1e1f26",
  surface: "#24252d",
  surfaceElevated: "#32333e",
  border: "#2c2e38",
  borderStrong: "#383a46",
  text: "#f0f1f4",
  textSecondary: "#b8bac4",
  muted: "#82858f",
  disabled: "#5c5e68",
  accent: "#8f9cff",
  accentLight: "#aab5ff",
  accentDark: "#6675dc",
  accentSubtle: "rgba(143, 156, 255, 0.1)",
  overlay: "rgba(0, 0, 0, 0.68)",
  pillShell: "#111316",
  pillBorder: "#2a3028",
  pillDotBase: "#282828",
  pillDotHighlight: "#ffffff",
  danger: "#ef4444",
  onDanger: "#ffffff",
  onAccent: "#141519",
} as const;
