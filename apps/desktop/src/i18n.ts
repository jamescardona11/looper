import { setupI18n, type Messages } from "@lingui/core";

import {
  DEFAULT_APP_LOCALE,
  DEFAULT_LOCALE,
  SUPPORTED_APP_LOCALES,
  normalizeSupportedAppLocale,
} from "./shared/lib/appLocales";
import type { AppLocaleSetting } from "./types";

type CatalogModules = Record<string, Messages>;

const catalogModules = import.meta.glob<Messages>("./locales/*/messages.po", {
  eager: true,
  import: "messages",
});

export function buildCatalogRegistry(modules: CatalogModules) {
  const registry = new Map<string, Messages>();

  for (const [path, messages] of Object.entries(modules)) {
    const locale = localeFromCatalogPath(path);
    if (locale) registry.set(locale, messages);
  }

  for (const locale of SUPPORTED_APP_LOCALES) {
    if (!registry.has(locale)) {
      throw new Error(`Missing locale catalog for ${locale}`);
    }
  }

  return registry;
}

function localeFromCatalogPath(path: string) {
  const segments = path.split("/");
  if (
    segments.length !== 4 ||
    segments[0] !== "." ||
    segments[1] !== "locales"
  ) {
    return null;
  }
  if (segments[3] !== "messages.po") return null;
  return segments[2]?.trim().toLowerCase() || null;
}

function requestedLocale(setting?: AppLocaleSetting | string | null) {
  if (setting && setting !== DEFAULT_APP_LOCALE) return setting;
  return typeof navigator === "undefined" ? DEFAULT_LOCALE : navigator.language;
}

const catalogs = buildCatalogRegistry(catalogModules);
export const i18n = setupI18n();

export function activateLocale(setting?: AppLocaleSetting | string | null) {
  const locale = normalizeSupportedAppLocale(requestedLocale(setting));
  const messages = catalogs.get(locale);
  if (!messages) throw new Error(`Locale catalog unavailable: ${locale}`);

  i18n.load(locale, messages);
  i18n.activate(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  return locale;
}

activateLocale(DEFAULT_APP_LOCALE);
