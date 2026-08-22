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

/**
 * Los neutros son neutros: croma 0. Blanco y negro son los protagonistas y el
 * morado es el único color de la interfaz, así que la escala de grises no
 * arrastra tinte de marca en ningún peldaño.
 *
 * Se probó teñirla con `BRAND_HUE` a croma bajo para que grises y marca se
 * leyeran como una familia. Se descartó: el fondo dejaba de ser negro.
 */
export function neutralChroma(_l: number): number {
  return 0;
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
  bgPrimary: neutral(0),
  bgSecondary: neutral(0.145),
  bgTertiary: neutral(0.195),
  bgSurface: neutral(0.245),
  bgOverlay: neutral(0.29),
  bgElevated: neutral(0.335),
  bgElevatedHover: neutral(0.365),
  bgHover: neutral(0.4),
  borderPrimary: neutral(0.275),
  borderSecondary: neutral(0.35),
  borderHover: neutral(0.48),
  textDisabled: neutral(0.5),
  textMuted: neutral(0.62),
  textSecondary: neutral(0.8),
  textPrimary: neutral(1),
} as const;

/**
 * La página es blanco puro y el fondo oscuro negro puro, que es lo que pedía
 * el sistema: blanco y negro son los protagonistas. En claro la elevación no
 * la carga el lightness: la parte alta choca contra el
 * techo de 1.0 y sólo quedan unos pocos puntos entre la página y el blanco. La
 * separación la hacen el borde y la sombra, y `bgElevated` baja en vez de subir.
 */
const LIGHT_NEUTRALS = {
  bgPrimary: neutral(1),
  bgSecondary: neutral(0.985),
  bgTertiary: neutral(0.97),
  bgSurface: neutral(1),
  bgOverlay: neutral(1),
  bgElevated: neutral(0.955),
  bgElevatedHover: neutral(0.925),
  bgHover: neutral(0.89),
  borderPrimary: neutral(0.91),
  borderSecondary: neutral(0.85),
  borderHover: neutral(0.64),
  textDisabled: neutral(0.66),
  textMuted: neutral(0.52),
  textSecondary: neutral(0.41),
  textPrimary: neutral(0),
} as const;

/**
 * Dos acentos, uno por modo, y con margen.
 *
 * Hubo un intento de usar un valor único (#626bd5). Pasaba 4,58:1 sobre negro y
 * sobre blanco, pero esos no son los fondos donde vive el texto de acento: vive
 * sobre chips `accent-10` y sobre `bg-surface`, y ahí caía a 4,28, 4,04 y 3,56.
 * Optimizaba la métrica equivocada.
 *
 * Estos dos se eligieron midiendo contra los fondos reales, y con el croma más
 * alto que los aguanta: 0.19 y 0.24 frente al 0.144 del periwinkle anterior,
 * que era pastel precisamente por tener poco croma y mucha luz.
 */
const DARK_ACCENT_BASE = { l: 0.635, c: 0.19, h: BRAND_HUE } as const;
const LIGHT_ACCENT_BASE = { l: 0.555, c: 0.24, h: BRAND_HUE } as const;

const DARK_ACCENT = {
  base: DARK_ACCENT_BASE,
  light: DARK_ACCENT_BASE,
  dark: DARK_ACCENT_BASE,
  ink: DARK_ACCENT_BASE,
  solid: DARK_ACCENT_BASE,
} as const;

const LIGHT_ACCENT = {
  base: LIGHT_ACCENT_BASE,
  light: LIGHT_ACCENT_BASE,
  dark: LIGHT_ACCENT_BASE,
  ink: LIGHT_ACCENT_BASE,
  solid: LIGHT_ACCENT_BASE,
} as const;

/**
 * Sólo el error conserva color propio: es el único estado donde el color carga
 * significado de seguridad y no de estilo, y el único que un usuario nuevo
 * interpreta sin aprender nada.
 *
 * `success`, `warning` e `info` pasan al acento o a la escala neutra. Eso
 * traslada la carga al icono y a la forma: un check, un triángulo. Es trabajo
 * de diseño real, no un cambio de token — si un estado deja de distinguirse,
 * le falta iconografía, no color.
 */
const DARK_SEMANTIC = {
  error: "#ef4444",
  success: "ACCENT",
  warning: "TEXT_SECONDARY",
  warningStrong: "TEXT_PRIMARY",
  info: "ACCENT",
  onError: "#ffffff",
} as const;

const LIGHT_SEMANTIC = {
  error: "#b91c1c",
  success: "ACCENT",
  warning: "TEXT_SECONDARY",
  warningStrong: "TEXT_PRIMARY",
  info: "ACCENT",
  onError: "#ffffff",
} as const;

/**
 * Diarización de reuniones. Seis peldaños de la escala neutra, no del acento:
 * el morado queda reservado para "activo" y un hablante nunca debe parecer un
 * estado. Empiezan en 0.55 para que todos se lean sobre el fondo negro.
 *
 * El coste es real y conviene tenerlo presente: seis grises se distinguen peor
 * que seis tonos. El rango va de 0.52 a 0.97 para que queden 9 puntos de ΔE
 * entre vecinos, el mínimo que el test acepta. El primero da 4,3:1 sobre negro,
 * así que sirve como punto o chip, no como color de texto.
 *
 * La respuesta a una reunión de seis no es reintroducir seis colores sino
 * etiquetar al hablante con su inicial además del gris.
 */
const SPEAKER_LIGHTNESS = [0.52, 0.61, 0.7, 0.79, 0.88, 0.97] as const;

export const SPEAKERS: readonly Oklch[] = SPEAKER_LIGHTNESS.map((l) => ({
  l,
  c: 0,
  h: BRAND_HUE,
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

/**
 * Semántica visual exclusiva de la app móvil. No cambia los tokens de web ni
 * desktop: el generador la consume sólo al producir `apps/mobile`.
 */
export const MOBILE_MINIMAL = {
  accent: "#6754e8",
  accentDark: "#5140bd",
  accentLight: "#d9d0ff",
  canvas: "#efede7",
  coral: "#ec6d72",
  disabled: "#aaa6ad",
  ink: "#17171b",
  line: "#d8d3ca",
  muted: "#77747d",
  paper: "#fbfaf5",
  soft: "#e5e2db",
  secondary: "#55535c",
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
