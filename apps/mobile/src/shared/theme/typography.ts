import type { TextStyle } from "react-native";

/**
 * Escala tipográfica móvil. Sube un escalón respecto al desktop porque se lee
 * a distancia de mano.
 *
 * `letterSpacing` en React Native va en PUNTOS, no en em: cada valor es el
 * tracking de diseño multiplicado por su tamaño (display 29 × -0.03 = -0.87).
 */

type TypeRole = {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle["fontWeight"];
  letterSpacing: number;
};

export const typography = {
  display: { fontSize: 29, lineHeight: 35, fontWeight: "700", letterSpacing: -0.87 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.65 },
  section: { fontSize: 19, lineHeight: 25, fontWeight: "700", letterSpacing: -0.38 },
  item: { fontSize: 16, lineHeight: 21, fontWeight: "600", letterSpacing: -0.16 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400", letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: "600", letterSpacing: 0.99 },
} as const satisfies Record<string, TypeRole>;

export type TypographyRole = keyof typeof typography;

/** Optional display-family override. Undefined keeps the platform font. */
export const displayFontFamily: string | undefined = undefined;
