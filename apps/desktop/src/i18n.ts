import { setupI18n, type Messages } from "@lingui/core";

import {
  DEFAULT_APP_LOCALE,
  DEFAULT_LOCALE,
  SUPPORTED_APP_LOCALES,
} from "./shared/lib/appLocales";
import type { AppLocaleSetting } from "./contracts";
import {
  buildCatalogRegistry as buildRegistry,
  createLocaleController,
  type CatalogModules,
} from "./i18n-locale-policy";

const catalogModules = import.meta.glob<Messages>("./locales/*/messages.po", {
  eager: true,
  import: "messages",
});

export function buildCatalogRegistry(modules: CatalogModules) {
  return buildRegistry(modules, SUPPORTED_APP_LOCALES);
}

export const i18n = setupI18n();

const localeController = createLocaleController({
  runtime: i18n,
  supportedLocales: SUPPORTED_APP_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  catalogModules,
  getSystemLocale: () =>
    typeof navigator === "undefined" ? undefined : navigator.language,
  document: typeof document === "undefined" ? undefined : document,
});

export { createLocaleController };

export function activateLocale(setting?: AppLocaleSetting | string | null) {
  return localeController.activateLocale(setting);
}

activateLocale(DEFAULT_APP_LOCALE);
