import type { Locale } from "@looper/i18n";
import { useTranslation } from "@looper/i18n/react";
import { useLandingCopy } from "../lib/landing-copy";

export function LanguageSwitcher({ compact = false }: { readonly compact?: boolean }) {
  const { locale, setLocale } = useTranslation();
  const { common } = useLandingCopy();

  function select(next: Locale) {
    setLocale(next);
    document.documentElement.lang = next;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <fieldset
      className={`inline-flex items-center rounded-full border border-border bg-background p-0.5 ${
        compact ? "text-[11px]" : "text-[12px]"
      }`}
    >
      <legend className="sr-only">{common.language}</legend>
      {(["en", "es"] as const).map((option) => (
        <button
          aria-pressed={locale === option}
          className={`min-h-9 rounded-full px-2.5 font-medium transition-colors ${
            locale === option
              ? "bg-foreground text-background"
              : "text-ink-muted hover:text-foreground"
          }`}
          key={option}
          onClick={() => select(option)}
          type="button"
        >
          {option === "en" ? "EN" : "ES"}
          <span className="sr-only"> {option === "en" ? common.english : common.spanish}</span>
        </button>
      ))}
    </fieldset>
  );
}
