import type { Messages } from "@lingui/core";

export type CatalogModule =
  Messages | { messages?: Messages } | { default?: { messages?: Messages } };

export type CatalogModules = Record<string, CatalogModule>;

export type LocaleRuntime = {
  load: (locale: string, messages: Messages) => void;
  activate: (locale: string) => void;
};

export type LocaleDocument = { documentElement?: { lang: string } };

export type LocaleControllerOptions = {
  runtime: LocaleRuntime;
  supportedLocales: readonly string[];
  defaultLocale: string;
  catalogModules: CatalogModules;
  getSystemLocale?: () => string | undefined;
  document?: LocaleDocument;
};

function localeFromCatalogPath(path: string) {
  const match = path.match(/^\.\/locales\/([^/]+)\/messages\.(?:po|js)$/);
  return match?.[1]?.trim().toLowerCase() || null;
}

function messagesFromModule(module: CatalogModule): Messages {
  if (typeof module === "object" && module !== null) {
    const wrapped = module as unknown as {
      messages?: Messages;
      default?: { messages?: Messages };
    };
    if (wrapped.messages) return wrapped.messages;
    if (wrapped.default?.messages) return wrapped.default.messages;
  }
  return module as Messages;
}

export function buildCatalogRegistry(
  modules: CatalogModules,
  supportedLocales: readonly string[],
) {
  const registry = new Map<string, Messages>();

  for (const [path, module] of Object.entries(modules)) {
    const locale = localeFromCatalogPath(path);
    if (locale) registry.set(locale, messagesFromModule(module));
  }

  for (const locale of supportedLocales) {
    if (!registry.has(locale)) {
      throw new Error(`Missing locale catalog for ${locale}`);
    }
  }

  return registry;
}

function localeCandidates(locale: string) {
  const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) return [];
  const base = normalized.split("-")[0];
  return base && base !== normalized ? [normalized, base] : [normalized];
}

function resolveLocale(
  requested: string | undefined,
  supportedLocales: readonly string[],
  defaultLocale: string,
) {
  const supported = new Set(supportedLocales);
  return (
    localeCandidates(requested ?? "").find((candidate) =>
      supported.has(candidate),
    ) ?? defaultLocale
  );
}

export function createLocaleController(options: LocaleControllerOptions) {
  const catalogs = buildCatalogRegistry(
    options.catalogModules,
    options.supportedLocales,
  );

  return {
    activateLocale(setting?: string | null) {
      const requested =
        !setting || setting === "system"
          ? options.getSystemLocale?.()
          : setting;
      const locale = resolveLocale(
        requested,
        options.supportedLocales,
        options.defaultLocale,
      );
      const messages = catalogs.get(locale);
      if (!messages) {
        throw new Error(`Locale catalog unavailable: ${locale}`);
      }

      options.runtime.load(locale, messages);
      options.runtime.activate(locale);
      if (options.document?.documentElement) {
        options.document.documentElement.lang = locale;
      }
      return locale;
    },
  };
}
