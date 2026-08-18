import supportedAppLocalesJson from "../../../supported-app-locales.json";

export const DEFAULT_LOCALE = "en";
export const DEFAULT_APP_LOCALE = "system";

export function parseLocaleCatalog(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("The app locale catalog must be a non-empty array");
  }

  const uniqueLocales = new Set<string>();
  for (const candidate of value) {
    if (
      typeof candidate !== "string" ||
      !candidate ||
      candidate !== candidate.trim() ||
      candidate !== candidate.toLowerCase()
    ) {
      throw new Error("App locale codes must be lowercase trimmed strings");
    }
    if (uniqueLocales.has(candidate)) {
      throw new Error(`Duplicate app locale: ${candidate}`);
    }
    uniqueLocales.add(candidate);
  }
  return [...uniqueLocales];
}

export const SUPPORTED_APP_LOCALES = Object.freeze(
  parseLocaleCatalog(supportedAppLocalesJson),
);

if (!SUPPORTED_APP_LOCALES.includes(DEFAULT_LOCALE)) {
  throw new Error(`The app locale catalog must include ${DEFAULT_LOCALE}`);
}

const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_APP_LOCALES);

function normalizedLocaleParts(locale?: string | null) {
  const normalized = locale?.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) return [];
  const [base] = normalized.split("-");
  return base && base !== normalized ? [normalized, base] : [normalized];
}

export function normalizeSupportedAppLocale(locale?: string | null): string {
  return (
    normalizedLocaleParts(locale).find((candidate) =>
      SUPPORTED_LOCALE_SET.has(candidate),
    ) ?? DEFAULT_LOCALE
  );
}

function localeAutonym(locale: string) {
  try {
    const canonical = Intl.getCanonicalLocales(locale)[0] ?? locale;
    const displayNames = new Intl.DisplayNames([canonical], {
      type: "language",
    });
    return displayNames.of(canonical) ?? canonical;
  } catch {
    return locale;
  }
}

export function buildAppLocaleOptions(systemLabel: string) {
  return [
    { value: DEFAULT_APP_LOCALE, label: systemLabel },
    ...SUPPORTED_APP_LOCALES.map((locale) => ({
      value: locale,
      label: localeAutonym(locale),
    })),
  ];
}
