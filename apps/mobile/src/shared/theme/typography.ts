import type { TextStyle } from "react-native";

/**
 * Escala tipográfica móvil. Sube un escalón respecto al desktop porque se lee
 * a distancia de mano.
 *
 * La dirección minimalista evita el tracking apretado: la lectura larga y los
 * nombres propios ganan aire antes que dramatismo tipográfico.
 */

type TypeRole = {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle["fontWeight"];
  letterSpacing: number;
};

export const typography = {
  display: { fontSize: 29, lineHeight: 35, fontWeight: "700", letterSpacing: 0 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: 0 },
  section: { fontSize: 19, lineHeight: 25, fontWeight: "700", letterSpacing: 0 },
  item: { fontSize: 16, lineHeight: 21, fontWeight: "600", letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400", letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: "600", letterSpacing: 0.99 },
} as const satisfies Record<string, TypeRole>;

export type TypographyRole = keyof typeof typography;

/** Optional display-family override. Undefined keeps the platform font. */
export const displayFontFamily: string | undefined = undefined;
