/**
 * Fuente única de verdad del color de Looper.
 *
 * Las tres superficies (web, desktop, mobile) se generan desde aquí con
 * `tools/tokens/generate.mjs`. No edites los ficheros generados a mano: un test
 * comprueba que coinciden con la salida de este módulo.
 *
 * Reglas del sistema:
 *  - Los neutros comparten el tono del acento (`BRAND_HUE`) para que la escala
 *    de grises y la marca se lean como una familia.
 *  - Su croma sale de `neutralChroma()`: máximo en los medios y prácticamente
 *    cero en los extremos, de forma que el negro más negro y el blanco más
 *    blanco no arrastran tinte.
 *  - Cada peldaño de fondo está separado 4-5 puntos de lightness. Menos que eso
 *    y dos superficies contiguas dejan de distinguirse.
 *  - Todo valor derivado (alfas, canales RGB para canvas) se calcula, nunca se
 *    copia: si el acento cambia, cambia con él.
 */

export type Oklch = { l: number; c: number; h: number };

/** Tono de marca. El acento y todos los neutros viven aquí. */
export const BRAND_HUE = 276.5;

/** Croma de un neutro: 0 en los extremos, máximo hacia el medio de la rampa. */
export function neutralChroma(l: number): number {
  return 0.026 * Math.min(l, 1 - l) * 2;
}

function srgbChannel(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(255 * encoded);
}

/** OKLCH → sRGB. Devuelve los tres canales en 0-255. */
export function oklchToRgb({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    srgbChannel(4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone),
    srgbChannel(-1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone),
    srgbChannel(-0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone),
  ];
}

export function oklchToHex(color: Oklch): string {
  return `#${oklchToRgb(color)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** "143, 156, 255" — para los visualizadores canvas, que necesitan canales. */
export function oklchToRgbChannels(color: Oklch): string {
  return oklchToRgb(color).join(", ");
}

export function hexToRgbChannels(hex: string): string {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)).join(", ");
}

/** rgba() a partir de un hex y una opacidad. */
export function alpha(hex: string, opacity: number): string {
  return `rgba(${hexToRgbChannels(hex)}, ${opacity})`;
}

function neutral(l: number): Oklch {
  return { l, c: neutralChroma(l), h: BRAND_HUE };
}

/**
 * Rampa neutra. Los mismos nombres de rol en ambos modos: el modo claro
 * recorre los mismos peldaños en sentido inverso.
 */
const DARK_NEUTRALS = {
  bgPrimary: neutral(0.18),
  bgSecondary: neutral(0.225),
  bgTertiary: neutral(0.265),
  bgSurface: neutral(0.305),
  bgOverlay: neutral(0.345),
  bgElevated: neutral(0.39),
  bgElevatedHover: neutral(0.415),
  bgHover: neutral(0.44),
  borderPrimary: neutral(0.3),
  borderSecondary: neutral(0.375),
  borderHover: neutral(0.48),
  textDisabled: neutral(0.52),
  textMuted: neutral(0.645),
  textSecondary: neutral(0.8),
  textPrimary: neutral(0.97),
} as const;

/**
 * En claro la elevación no la carga el lightness: la parte alta de la rampa
 * choca contra el techo de 1.0 y sólo quedan ~4 puntos entre la página y el
 * blanco. La separación la hacen el borde y la sombra, y `bgElevated` baja en
 * vez de subir. Por eso los peldaños de este modo son más cortos que los del
 * oscuro, que tiene todo el rango de 0.18 a 0.44 para repartir.
 */
const LIGHT_NEUTRALS = {
  bgPrimary: neutral(0.962),
  bgSecondary: neutral(0.982),
  bgTertiary: neutral(0.992),
  bgSurface: { l: 1, c: 0, h: BRAND_HUE },
  bgOverlay: { l: 1, c: 0, h: BRAND_HUE },
  bgElevated: neutral(0.94),
  bgElevatedHover: neutral(0.91),
  bgHover: neutral(0.88),
  borderPrimary: neutral(0.905),
  borderSecondary: neutral(0.845),
  borderHover: neutral(0.64),
  textDisabled: neutral(0.66),
  textMuted: neutral(0.53),
  textSecondary: neutral(0.42),
  textPrimary: neutral(0.25),
} as const;

/**
 * El acento no es el mismo valor en los dos modos. `#8f9cff` sobre el fondo
 * claro da 2,3:1 — ilegible. `ink` es su equivalente para texto y bordes en
 * claro, y `solid` el relleno de botón que admite texto blanco.
 */
const DARK_ACCENT = {
  base: { l: 0.724, c: 0.144, h: BRAND_HUE },
  light: { l: 0.792, c: 0.106, h: BRAND_HUE },
  dark: { l: 0.601, c: 0.156, h: BRAND_HUE },
  ink: { l: 0.724, c: 0.144, h: BRAND_HUE },
  solid: { l: 0.601, c: 0.156, h: BRAND_HUE },
} as const;

const LIGHT_ACCENT = {
  base: { l: 0.545, c: 0.16, h: BRAND_HUE },
  light: { l: 0.65, c: 0.15, h: BRAND_HUE },
  dark: { l: 0.47, c: 0.16, h: BRAND_HUE },
  ink: { l: 0.545, c: 0.16, h: BRAND_HUE },
  solid: { l: 0.5, c: 0.17, h: BRAND_HUE },
} as const;

/** Estados. `error` es el único color que no se puede sustituir por forma. */
const DARK_SEMANTIC = {
  error: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  warningStrong: "#fbbf24",
  info: "#3b82f6",
  onError: "#ffffff",
} as const;

const LIGHT_SEMANTIC = {
  error: "#b91c1c",
  success: "#047857",
  warning: "#b45309",
  warningStrong: "#92400e",
  info: "#1d4ed8",
  onError: "#ffffff",
} as const;

/**
 * Diarización de reuniones. Los tonos evitan a propósito la franja del acento
 * (250-305°) y la del error (5-45°): antes `speaker-1` estaba a ΔE 3,2 del
 * acento y `speaker-5` a 6,2, así que "hablante" y "estado activo" se leían
 * igual. Reparto uniforme por el arco restante.
 */
const SPEAKER_HUES = [48, 92, 136, 180, 224, 323] as const;
const SPEAKER_LIGHTNESS = 0.8;
const SPEAKER_CHROMA = 0.12;

export const SPEAKERS: readonly Oklch[] = SPEAKER_HUES.map((h) => ({
  l: SPEAKER_LIGHTNESS,
  c: SPEAKER_CHROMA,
  h,
}));

/**
 * Los dos colores del logo. `assets/brand/looper-*.svg` los lleva fijos porque
 * un SVG no puede leer tokens; aquí viven una sola vez para que cualquier
 * superficie que dibuje la marca use el mismo valor.
 */
export const BRAND_MARK = {
  ink: "#111111",
  paper: "#f7f5f2",
} as const;

export type Mode = "dark" | "light";

export type Palette = {
  neutrals: Record<keyof typeof DARK_NEUTRALS, Oklch>;
  accent: Record<keyof typeof DARK_ACCENT, Oklch>;
  semantic: Record<keyof typeof DARK_SEMANTIC, string>;
  speakers: readonly Oklch[];
};

export const PALETTE: Record<Mode, Palette> = {
  dark: {
    neutrals: DARK_NEUTRALS,
    accent: DARK_ACCENT,
    semantic: DARK_SEMANTIC,
    speakers: SPEAKERS,
  },
  light: {
    neutrals: LIGHT_NEUTRALS,
    accent: LIGHT_ACCENT,
    semantic: LIGHT_SEMANTIC,
    speakers: SPEAKERS,
  },
};

/** Opacidades de las variantes de acento que consume el desktop. */
export const ACCENT_ALPHAS = [5, 10, 15, 20, 30, 40, 50, 60, 80] as const;
