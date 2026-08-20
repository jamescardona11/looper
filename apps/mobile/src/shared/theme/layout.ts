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
/**
 * Relieve táctil. Sobre negro puro una sombra negra no se ve, así que el
 * volumen se hace con borde inferior: el control tiene cara y canto.
 *
 * Al pulsar, el canto pasa a 1 y la cara baja 2, de modo que la caja ocupa lo
 * mismo y solo se hunde. Deshabilitado pierde el canto: sin relieve no invita
 * a pulsarse.
 */
const PRESS_SCRIM = "rgba(0, 0, 0, 0.32)";

/** Lo que ocupa la píldora flotante de navegación, sin el inset inferior. */
export const captureBarZone = 74;

export const relief = {
  primary: {
    backgroundColor: colors.accent,
    borderBottomWidth: 4,
    // La paleta tiene un solo morado, así que el labio no puede ser un acento
    // más oscuro: es un velo negro sobre la propia cara del botón. El borde se
    // pinta por dentro de la caja, así que oscurece esa franja en vez de
    // dibujar una línea contra el fondo, donde el negro sería invisible.
    borderBottomColor: PRESS_SCRIM,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderBottomWidth: 3,
    borderBottomColor: colors.surfaceMuted,
  },
  pressed: {
    borderBottomWidth: 1,
    transform: [{ translateY: 2 }],
  },
  disabled: {
    borderBottomWidth: 0,
  },
} as const satisfies Record<string, ViewStyle>;
