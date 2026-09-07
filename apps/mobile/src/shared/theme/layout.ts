import type { ViewStyle } from "react-native";
import { colors } from "./colors";

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

/** Área táctil mínima de un icono suelto. */
export const hitTarget = 44;
/** Altura mínima de cualquier control con texto. */
export const controlHeight = 48;
/** Lo que ocupa la píldora flotante de navegación, sin el inset inferior. */
export const captureBarZone = 74;

export const relief = {
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
} as const satisfies Record<string, ViewStyle>;
