import type { TextStyle } from "react-native";

/**
 * Escala tipográfica del rediseño móvil (ai_docs/mobile-redesign.md). Sube un
 * escalón respecto al desktop porque se lee a distancia de mano.
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

/**
 * Hueco de Satoshi para display/title/section. Hoy `undefined` = fuente del
 * sistema: el repo solo tiene Satoshi en `.woff2` (apps/desktop/public/fonts/)
 * y React Native necesita `.otf`/`.ttf`.
 *
 * Para activarla hacen falta dos cosas, en este orden: dejar
 * `Satoshi-Variable.otf` en `apps/mobile/assets/fonts/` y cargarlo con
 * `expo-font` en el layout raíz. Antes de que exista el fichero no se añade
 * `expo-font`: un `useFonts` con un `require` que no resuelve rompe el bundle.
 */
export const displayFontFamily: string | undefined = undefined;
