#!/usr/bin/env node
/**
 * Genera los tokens de color de las tres superficies desde `@looper/config/palette`.
 *
 *   node tools/tokens/generate.mjs           escribe los ficheros
 *   node tools/tokens/generate.mjs --check   falla si están desincronizados
 *
 * La paleta (la ciencia del color) vive en packages/ts/config/src/palette.ts.
 * Este fichero sólo mapea esa paleta a los nombres que espera cada superficie.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ACCENT_ALPHAS,
  BRAND_MARK,
  MOBILE_MINIMAL,
  PALETTE,
  alpha,
  hexToRgbChannels,
  oklchToHex,
} from "../../packages/ts/config/src/palette.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BANNER = (source) =>
  `/* Generado por tools/tokens/generate.mjs desde ${source}. No editar a mano. */`;

/** Colores propios de una superficie del producto, no de la marca. */
const PRODUCT = {
  /* La previsualización de documento y la tarjeta de miembro son artefactos
     dibujados, no cromo de la interfaz, pero llevaban verdes que no salían de
     ningún token. Pasan a la escala neutra. */
  preview: {
    canvas: "#eaeaea",
    document: "#f7f7f7",
    primary: "#1f1f1f",
    secondary: "#5f5f5f",
    body: "#4d4d4d",
    border: "rgba(0, 0, 0, 0.08)",
  },
  memberCardLight: {
    bg: "#f2f2f2",
    text: "#161616",
    muted: "#6b6b6b",
    border: "#cbcbcb",
    dot: "#a8a8a8",
    stripe: "#e6e6e6",
  },
  memberCardDark: {
    bg: "#161616",
    text: "#f4f4f4",
    muted: "#868686",
    border: "#383838",
    dot: "#4e4e4e",
    stripe: "#101010",
  },
};

/**
 * Mapa de tokens del desktop. Devuelve pares [nombre, valor] en orden estable.
 * Todo lo que se puede derivar se deriva; nada se copia a mano.
 */
function desktopTokens(mode) {
  const p = PALETTE[mode];
  const isDark = mode === "dark";
  const hex = (c) => oklchToHex(c);

  const n = Object.fromEntries(
    Object.entries(p.neutrals).map(([k, v]) => [k, hex(v)]),
  );
  const accent = hex(p.accent.base);
  const accentLight = hex(p.accent.light);
  const accentDark = hex(p.accent.dark);
  const accentInk = hex(p.accent.ink);

  /* `local` y `cloud` no pueden estar a 20° del acento como estaban: eran
     indistinguibles. `local` ES el acento (es el estado preferente) y `cloud`
     se apoya en la escala neutra, que se lee sin depender del tono. */
  const cloud = isDark ? n.textSecondary : n.textMuted;
  const cloudLight = isDark ? n.textPrimary : n.textSecondary;
  const cloudDark = isDark ? n.textMuted : n.textPrimary;

  const alphaScale = (name, base, opacities) =>
    opacities.map((o) => [`--color-${name}-${o}`, alpha(base, o / 100)]);

  /* La semántica sólo conserva color en el error; el resto son alias. */
  const semantic = (key) => {
    const value = p.semantic[key];
    if (value === "ACCENT") return accent;
    if (value === "TEXT_SECONDARY") return n.textSecondary;
    if (value === "TEXT_PRIMARY") return n.textPrimary;
    return value;
  };

  const shadowBase = isDark ? "0, 0, 0" : "26, 23, 22";
  const inkOnLight = isDark ? "255, 255, 255" : "26, 23, 22";

  return [
    ["--color-bg-primary", n.bgPrimary],
    ["--color-bg-secondary", n.bgSecondary],
    ["--color-bg-tertiary", n.bgTertiary],
    ["--color-bg-surface", n.bgSurface],
    ["--color-bg-overlay", n.bgOverlay],
    ["--color-bg-elevated", n.bgElevated],
    ["--color-bg-elevated-hover", n.bgElevatedHover],
    ["--color-bg-hover", n.bgHover],
    ["--canvas-top", n.bgTertiary],

    ["--color-border-primary", n.borderPrimary],
    ["--color-border-secondary", n.borderSecondary],
    ["--color-border-hover", n.borderHover],
    ["--border-subtle", "var(--color-border-primary)"],
    ["--border-strong", "var(--color-border-secondary)"],
    ["--border-emphasis", "var(--color-border-hover)"],

    ["--color-text-primary", n.textPrimary],
    ["--color-text-secondary", n.textSecondary],
    ["--color-text-muted", n.textMuted],
    ["--color-text-disabled", n.textDisabled],

    ["--color-accent", accent],
    ["--color-accent-light", accentLight],
    ["--color-accent-dark", accentDark],
    ["--color-accent-hover", isDark ? accentLight : accentDark],
    ["--color-accent-ink", accentInk],
    ...alphaScale("accent", accent, [5, 10, 20, 30, 50, 80]),

    ["--color-local", "var(--color-accent)"],
    ["--color-local-light", "var(--color-accent-light)"],
    ["--color-local-dark", "var(--color-accent-dark)"],
    ["--color-local-hover", "var(--color-accent-hover)"],
    ...ACCENT_ALPHAS.map((o) => [`--color-local-${o}`, alpha(accent, o / 100)]),

    ["--color-cloud", cloud],
    ["--color-cloud-light", cloudLight],
    ["--color-cloud-dark", cloudDark],
    ["--color-cloud-hover", cloudLight],
    ...alphaScale("cloud", cloud, [5, 10, 20, 30, 50, 80]),

    ["--color-interactive", "var(--color-accent)"],
    ["--color-interactive-10", "var(--color-accent-10)"],
    ["--color-interactive-20", "var(--color-accent-20)"],
    ["--color-interactive-30", "var(--color-accent-30)"],
    ["--color-toggle-on", "var(--color-accent)"],
    ["--color-toggle-on-20", "var(--color-accent-20)"],
    ["--color-toggle-on-30", "var(--color-accent-30)"],
    ["--color-section-marker", "var(--color-accent)"],
    ["--color-section-marker-alt", "var(--color-accent)"],

    ["--color-success", semantic("success")],
    ["--color-error", semantic("error")],
    ["--color-warning", semantic("warning")],
    ["--color-warning-strong", semantic("warningStrong")],
    ["--color-info", semantic("info")],
    ["--color-on-error", semantic("onError")],
    [
      "--color-danger-border",
      "color-mix(in srgb, var(--color-error) 30%, transparent)",
    ],
    [
      "--surface-danger-subtle",
      "color-mix(in srgb, var(--color-error) 8%, transparent)",
    ],

    ["--surface-sunken", "var(--color-bg-primary)"],
    ["--surface-base", "var(--color-bg-secondary)"],
    ["--surface-raised", "var(--color-bg-surface)"],
    ["--surface-floating", "var(--color-bg-overlay)"],
    ["--surface-interactive", `rgba(${inkOnLight}, ${isDark ? 0.04 : 0.05})`],
    [
      "--surface-interactive-strong",
      `rgba(${inkOnLight}, ${isDark ? 0.08 : 0.09})`,
    ],
    [
      "--surface-interactive-pressed",
      `rgba(${inkOnLight}, ${isDark ? 0.12 : 0.13})`,
    ],

    /* El pill es un overlay nativo: se mantiene oscuro en los dos modos,
       porque flota sobre el escritorio del usuario y no sobre la app. */
    ["--ui-pill-shell-bg", oklchToHex(PALETTE.dark.neutrals.bgPrimary)],
    ["--ui-pill-shell-border", oklchToHex(PALETTE.dark.neutrals.borderPrimary)],
    ["--ui-fn-ring-track", "rgba(255, 255, 255, 0.14)"],
    ["--color-pill-preview-text", "rgba(255, 255, 255, 0.85)"],
    ["--color-pill-control-text", "rgba(255, 255, 255, 0.55)"],
    ["--color-pill-control-border", "rgba(255, 255, 255, 0.18)"],
    ["--color-pill-control-border-active", "rgba(255, 255, 255, 0.5)"],
    ["--surface-pill-control", "rgba(255, 255, 255, 0.04)"],
    ["--surface-pill-control-muted", "rgba(255, 255, 255, 0.06)"],
    ["--surface-pill-control-active", "rgba(255, 255, 255, 0.14)"],
    ["--color-meeting-awareness", "var(--color-accent)"],

    /* Canales sueltos para los visualizadores canvas, que no leen colores CSS.
       Se derivan del token: antes eran copias a mano y no seguían al acento. */
    ["--ui-pill-dot-base-rgb", hexToRgbChannels(n.bgSurface)],
    ["--ui-pill-dot-highlight-rgb", "255, 255, 255"],
    ["--ui-pill-dot-error-rgb", hexToRgbChannels(semantic("error"))],
    ["--ui-pill-cleanup-rgb", hexToRgbChannels(accent)],

    /* El halo hereda del propio verde de captura. Antes estaba fijado al verde
       del modo claro, así que en claro el punto y su halo eran el mismo color
       y el halo desaparecía. */
    ["--ui-capture-fg-strong", n.textPrimary],
    ["--ui-capture-fg", n.textSecondary],
    ["--ui-capture-muted", n.textMuted],
    ["--ui-capture-key-bg", n.bgTertiary],
    [
      "--ui-capture-dot-halo",
      "color-mix(in srgb, var(--color-success) 25%, transparent)",
    ],

    ["--color-scrollbar-thumb", `rgba(${inkOnLight}, ${isDark ? 0.1 : 0.18})`],
    [
      "--color-scrollbar-thumb-hover",
      `rgba(${inkOnLight}, ${isDark ? 0.2 : 0.32})`,
    ],
    [
      "--color-scrollbar-thumb-subtle",
      `rgba(${inkOnLight}, ${isDark ? 0.08 : 0.1})`,
    ],
    [
      "--color-scrollbar-thumb-subtle-hover",
      `rgba(${inkOnLight}, ${isDark ? 0.15 : 0.2})`,
    ],
    ["--color-shadow-soft-40", `rgba(${shadowBase}, ${isDark ? 0.4 : 0.1})`],
    ["--color-shadow-soft-50", `rgba(${shadowBase}, ${isDark ? 0.5 : 0.14})`],
    ["--color-mask-opaque", "#000000"],

    ["--color-size-small", isDark ? accentLight : n.textMuted],
    ["--color-size-medium", isDark ? accent : n.textMuted],
    ["--color-size-large", isDark ? semantic("error") : n.textMuted],

    ["--model-wave-whisper", isDark ? accent : n.textSecondary],
    ["--model-wave-nvidia", isDark ? accent : n.textSecondary],
    ["--model-wave-cloud", "var(--color-cloud)"],
    ["--model-wave-glow-strong-whisper", "var(--color-accent-20)"],
    ["--model-wave-glow-soft-whisper", "var(--color-accent-10)"],
    ["--model-wave-glow-strong-nvidia", "var(--color-accent-20)"],
    ["--model-wave-glow-soft-nvidia", "var(--color-accent-10)"],
    ["--model-wave-glow-strong-cloud", "var(--color-cloud-20)"],
    ["--model-wave-glow-soft-cloud", "var(--color-cloud-10)"],

    ["--color-support-help", isDark ? semantic("warningStrong") : n.textMuted],
    ["--color-support-info", isDark ? accent : n.textMuted],
    [
      "--color-row-action-fade",
      `color-mix(in srgb, var(--color-bg-tertiary) ${isDark ? "96%, #ffffff 4%" : "94%, #1a1716 6%"})`,
    ],
    ["--color-brand-ink", BRAND_MARK.ink],
    ["--color-brand-paper", BRAND_MARK.paper],
    ["--surface-onboarding-logo", oklchToHex(PALETTE.dark.neutrals.bgSecondary)],
    ["--color-onboarding-logo-ring", "rgba(255, 255, 255, 0.1)"],

    ...p.speakers.map((s, i) => [`--data-speaker-${i + 1}`, hex(s)]),

    ["--surface-preview-canvas", PRODUCT.preview.canvas],
    ["--surface-preview-document", PRODUCT.preview.document],
    ["--color-preview-primary", PRODUCT.preview.primary],
    ["--color-preview-secondary", PRODUCT.preview.secondary],
    ["--color-preview-body", PRODUCT.preview.body],
    ["--color-preview-border", PRODUCT.preview.border],

    ...Object.entries(PRODUCT.memberCardLight).map(([k, v]) => [
      `--member-card-light-${k}`,
      v,
    ]),
    ...Object.entries(PRODUCT.memberCardDark).map(([k, v]) => [
      `--member-card-dark-${k}`,
      v,
    ]),
  ];
}

function renderDesktopCss() {
  const block = (selector, tokens) =>
    `${selector} {\n${tokens.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`;
  return [
    BANNER("packages/ts/config/src/palette.ts"),
    "",
    block(":root", desktopTokens("dark")),
    "",
    block(':root[data-theme="light"]', desktopTokens("light")),
    "",
  ].join("\n");
}

/** Web usa nombres shadcn y valores oklch() literales. */
function webTokens(mode) {
  const p = PALETTE[mode];
  const hex = (c) => oklchToHex(c);
  const n = Object.fromEntries(
    Object.entries(p.neutrals).map(([k, v]) => [k, hex(v)]),
  );
  const isDark = mode === "dark";
  const accent = hex(p.accent.base);
  const semantic = (key) => {
    const value = p.semantic[key];
    if (value === "ACCENT") return accent;
    if (value === "TEXT_SECONDARY") return n.textSecondary;
    if (value === "TEXT_PRIMARY") return n.textPrimary;
    return value;
  };
  return [
    ["--brand", hex(p.accent.base)],
    ["--brand-foreground", isDark ? n.bgPrimary : "#ffffff"],
    ["--background", n.bgPrimary],
    ["--foreground", n.textPrimary],
    ["--card", isDark ? n.bgSecondary : n.bgSurface],
    ["--card-foreground", n.textPrimary],
    ["--popover", isDark ? n.bgSecondary : n.bgSurface],
    ["--popover-foreground", n.textPrimary],
    ["--secondary", isDark ? n.bgTertiary : n.bgSecondary],
    ["--secondary-foreground", n.textPrimary],
    ["--muted", isDark ? n.bgTertiary : n.bgSecondary],
    ["--muted-foreground", n.textMuted],
    ["--destructive", semantic("error")],
    ["--destructive-foreground", semantic("onError")],
    ["--border", n.borderPrimary],
    ["--input", n.borderSecondary],
    ["--success-subtle", alpha(semantic("success"), isDark ? 0.16 : 0.12)],
    ["--success-foreground", semantic("success")],
    ["--warning-subtle", alpha(semantic("warning"), isDark ? 0.16 : 0.12)],
    ["--warning-foreground", semantic("warning")],
    ["--primary", "var(--brand)"],
    ["--primary-foreground", "var(--brand-foreground)"],
    ["--accent", "var(--brand)"],
    ["--accent-foreground", "var(--brand-foreground)"],
    ["--ring", "var(--brand)"],
  ];
}

function renderWebCss() {
  const block = (selector, tokens) =>
    `${selector} {\n${tokens.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`;
  return [
    BANNER("packages/ts/config/src/palette.ts"),
    "/* tokens.css importa este fichero y añade sólo los tokens web-only. */",
    "",
    block(":root,\n.dark", webTokens("dark")),
    "",
    block(".light", webTokens("light")),
    "",
  ].join("\n");
}

/** React Native no lee variables CSS: recibe el mismo mapa como objeto. */
function renderMobileTs() {
  const light = PALETTE.light;
  const hex = (c) => oklchToHex(c);
  const n = Object.fromEntries(
    Object.entries(light.neutrals).map(([k, v]) => [k, hex(v)]),
  );
  const accent = MOBILE_MINIMAL.accent;
  const entries = [
    ["background", MOBILE_MINIMAL.canvas],
    ["backgroundSecondary", MOBILE_MINIMAL.paper],
    ["surfaceMuted", MOBILE_MINIMAL.soft],
    ["surface", MOBILE_MINIMAL.paper],
    ["surfaceElevated", n.bgElevated],
    ["border", MOBILE_MINIMAL.line],
    ["borderStrong", n.borderSecondary],
    ["text", MOBILE_MINIMAL.ink],
    ["textSecondary", MOBILE_MINIMAL.secondary],
    ["muted", MOBILE_MINIMAL.muted],
    ["disabled", MOBILE_MINIMAL.disabled],
    ["accent", accent],
    ["accentLight", MOBILE_MINIMAL.accentLight],
    ["accentDark", MOBILE_MINIMAL.accentDark],
    ["accentSubtle", alpha(accent, 0.12)],
    ["overlay", "rgba(0, 0, 0, 0.68)"],
    ["shadow", "#000000"],
    ["pillShell", MOBILE_MINIMAL.ink],
    ["pillBorder", "rgba(255, 255, 255, 0.14)"],
    ["pillDotBase", "#37363d"],
    ["pillDotHighlight", "#ffffff"],
    ["brandPaper", BRAND_MARK.paper],
    ["danger", MOBILE_MINIMAL.coral],
    ["onDanger", "#ffffff"],
    ["onAccent", "#ffffff"],
  ];
  return [
    "/**",
    " * Generado por tools/tokens/generate.mjs desde",
    " * packages/ts/config/src/palette.ts. No editar a mano.",
    " *",
    " * React Native no puede consumir las variables CSS del desktop, así que este",
    " * mapa mantiene los mismos roles y los mismos valores para el shell móvil.",
    " */",
    "export const colors = {",
    ...entries.map(([k, v]) => `  ${k}: "${v}",`),
    "} as const;",
    "",
  ].join("\n");
}

const TARGETS = [
  ["apps/desktop/src/app/styles/tokens.colors.generated.css", renderDesktopCss],
  ["apps/web/src/app/tokens.generated.css", renderWebCss],
  ["apps/mobile/src/shared/theme/colors.ts", renderMobileTs],
];

export function generate() {
  return TARGETS.map(([relativePath, render]) => ({
    path: relativePath,
    contents: render(),
  }));
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const { path, contents } of generate()) {
    const absolute = join(ROOT, path);
    if (check) {
      let current = "";
      try {
        current = readFileSync(absolute, "utf8");
      } catch {
        current = "";
      }
      if (current !== contents) stale.push(path);
    } else {
      writeFileSync(absolute, contents);
      process.stdout.write(`escrito ${path}\n`);
    }
  }
  if (check && stale.length > 0) {
    process.stderr.write(
      `Tokens desincronizados:\n${stale.map((p) => `  ${p}`).join("\n")}\n` +
        "Ejecuta: node tools/tokens/generate.mjs\n",
    );
    process.exit(1);
  }
  if (check) process.stdout.write("tokens sincronizados\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
