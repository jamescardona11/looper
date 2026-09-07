import { useTranslation } from "@looper/i18n/react";
import { IconCheck, IconLanguage } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { SectionHeader } from "../components/section-header";

export function LanguageTab() {
  const { t, locale, setLocale, supportedLocales } = useTranslation();
  const localeLabels: Record<string, string> = {
    en: "English",
    es: "Español",
  };
  const localeDescriptions: Record<string, string> = {
    en: t("settings.englishInterface"),
    es: t("settings.spanishInterface"),
  };

  return (
    <div>
      <SectionHeader
        title={t("settings.language")}
        hint={t("settings.languageHint")}
        icon={<IconLanguage />}
      />
      <fieldset className="web-product-panel overflow-hidden rounded-xl">
        <legend className="sr-only">{t("settings.displayLanguage")}</legend>
        {supportedLocales.map((option) => {
          const selected = locale === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setLocale(option)}
              className={cn(
                "flex min-h-20 w-full items-center gap-4 border-border border-b p-5 text-left transition-colors last:border-b-0",
                selected ? "bg-primary/5" : "bg-card hover:bg-secondary/40",
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-background font-mono text-muted-foreground text-xs uppercase">
                {option}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium tracking-tight">
                  {localeLabels[option] ?? option}
                </span>
                <span className="mt-1 block text-muted-foreground text-sm">
                  {localeDescriptions[option] ?? option}
                </span>
              </span>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border border-border text-transparent",
                  selected && "border-primary bg-primary text-primary-foreground",
                )}
              >
                <IconCheck className="size-3.5" aria-hidden />
              </span>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
