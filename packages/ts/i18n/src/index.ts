import { i18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
import { en } from "./locales/en";
import { es } from "./locales/es";

export type Locale = "en" | "es";
// Every translation key, inferred from the source-of-truth `en` catalog. Use it
// to type-check t() calls and to keep `es` in parity (see locales/es.ts).
export type TranslationKey = keyof typeof en;
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es"] as const;
export const DEFAULT_LOCALE: Locale = "en";

const catalogs: Record<Locale, Record<string, string>> = { en, es };

// Pre-compile every message into Lingui's runtime form. This is load-bearing:
// Lingui only auto-compiles uncompiled string messages in development. In a
// production bundle (Metro/Vite inline NODE_ENV="production") it does NOT, so
// uncompiled catalogs render raw "{placeholder}" text for any parameterized
// string. Compiling here makes interpolation deterministic in every mode.
// Cached per locale so the compile cost is paid once.
const compiledCache = new Map<Locale, Record<string, ReturnType<typeof compileMessage>>>();

function compiledCatalog(locale: Locale): Record<string, ReturnType<typeof compileMessage>> {
  const cached = compiledCache.get(locale);
  if (cached) return cached;
  const source = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  const compiled: Record<string, ReturnType<typeof compileMessage>> = {};
  for (const key in source) compiled[key] = compileMessage(source[key]!);
  compiledCache.set(locale, compiled);
  return compiled;
}

export function activateLocale(locale: Locale) {
  i18n.load(locale, compiledCatalog(locale));
  i18n.activate(locale);
}

export function detectLocale(): Locale {
  if (typeof globalThis === "undefined") return DEFAULT_LOCALE;
  const nav = (globalThis as any).navigator;
  if (!nav) return DEFAULT_LOCALE;
  const lang = nav.language?.split("-")[0];
  if (SUPPORTED_LOCALES.includes(lang as Locale)) return lang as Locale;
  return DEFAULT_LOCALE;
}

// The user's persisted choice (written by the provider's setLocale). Read it
// from localStorage / the kv-store shim; null when unset or on platforms without
// storage.
export function readStoredLocale(): Locale | null {
  try {
    const s = (globalThis as any).localStorage?.getItem("locale");
    if (s && SUPPORTED_LOCALES.includes(s as Locale)) return s as Locale;
  } catch {}
  return null;
}

// Single source of truth for the launch locale: persisted choice wins, else
// auto-detect. Used by BOTH the module init below and the React provider so they
// can never resolve to different locales.
export function resolveInitialLocale(): Locale {
  return readStoredLocale() ?? detectLocale();
}

// Activate the persisted locale at module load (not a hardcoded default). This is
// the root fix for a state/runtime divergence: a dev bundle re-eval re-runs this
// line, so it must re-activate the user's actual locale ("es") rather than
// snapping the singleton back to "en" while the mounted provider still holds "es".
activateLocale(resolveInitialLocale());

export { en, es, i18n };
