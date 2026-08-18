import { i18n } from "@lingui/core";
import { I18nProvider as LinguiProvider } from "@lingui/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  activateLocale,
  type Locale,
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  type TranslationKey,
} from "./index";

// Known keys autocomplete and typo-check; `(string & {})` keeps dynamic feature
// keys valid without casts.
type TKey = TranslationKey | (string & {});

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (id: TKey, values?: Record<string, unknown>) => string;
  supportedLocales: readonly Locale[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  defaultLocale,
}: {
  children: ReactNode;
  defaultLocale?: Locale;
}) {
  // PURE initializer: only resolve the value (persisted choice wins, else detect).
  // The runtime activation happens in the layout effect below, never as a render
  // side effect. An explicit `defaultLocale` prop still overrides.
  const [locale, setLocaleState] = useState<Locale>(() => defaultLocale ?? resolveInitialLocale());
  const [activatedLocale, setActivatedLocale] = useState<Locale | null>(() =>
    i18n.locale === locale ? locale : null,
  );

  const setLocale = useCallback((next: Locale) => {
    activateLocale(next);
    setActivatedLocale(next);
    setLocaleState(next);
    try {
      (globalThis as any).localStorage?.setItem("locale", next);
    } catch {}
  }, []);

  // `locale` is an INTENTIONAL invalidation dependency: it forces this function's
  // identity to change whenever the locale does, so memoized `t("constant")` calls
  // (including those produced by React Compiler) re-run after a mid-session locale
  // switch instead of returning the previous locale's cached string.
  // biome-ignore lint/correctness/useExhaustiveDependencies: locale is an intentional invalidation dep (see comment above)
  const translate = useCallback(
    (id: TKey, values?: Record<string, unknown>) => i18n.t(id, values),
    [locale],
  );

  // Keep the module-scoped i18n singleton in sync with our React state, without a
  // side effect during render. Runs on mount (activating the resolved initial
  // locale) and on every locale change, synchronously before paint so there's no
  // flash. Pairs with index.ts reading the persisted locale at module init: a dev
  // bundle re-eval re-activates the stored locale instead of snapping to "en", and
  // this re-syncs whenever React state or the provider remounts.
  useLayoutEffect(() => {
    if (i18n.locale !== locale) activateLocale(locale);
    if (activatedLocale !== locale) setActivatedLocale(locale);
  }, [activatedLocale, locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: translate,
      supportedLocales: SUPPORTED_LOCALES,
    }),
    [locale, setLocale, translate],
  );

  return activatedLocale === locale ? (
    <I18nContext value={value}>
      <LinguiProvider i18n={i18n}>{children}</LinguiProvider>
    </I18nContext>
  ) : null;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

export function useLocale(): Locale {
  return useTranslation().locale;
}
