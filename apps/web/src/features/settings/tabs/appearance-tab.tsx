import { useTranslation } from "@looper/i18n/react";
import { IconCheck, IconDeviceDesktop, IconMoon, IconPalette, IconSun } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { type Theme, useTheme } from "@/lib/theme";
import { SectionHeader } from "../components/section-header";

export function AppearanceTab() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const options: Array<{
    value: Theme;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }> = [
    {
      value: "system",
      label: t("settings.system"),
      hint: t("settings.systemHint"),
      icon: <IconDeviceDesktop />,
    },
    {
      value: "light",
      label: t("settings.light"),
      hint: t("settings.lightHint"),
      icon: <IconSun />,
    },
    {
      value: "dark",
      label: t("settings.dark"),
      hint: t("settings.darkHint"),
      icon: <IconMoon />,
    },
  ];

  return (
    <div>
      <SectionHeader
        title={t("settings.appearance")}
        hint={t("settings.appearanceHint")}
        icon={<IconPalette />}
      />
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t("settings.appearance")}</legend>
        {options.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(option.value)}
              className={cn(
                "group min-h-36 rounded-xl border p-5 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:border-primary/30",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-lg border border-border bg-background text-muted-foreground [&_svg]:size-5",
                    selected && "text-primary",
                  )}
                >
                  {option.icon}
                </span>
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border border-border text-transparent",
                    selected && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  <IconCheck className="size-3.5" aria-hidden />
                </span>
              </div>
              <p className="mt-6 font-medium tracking-tight">{option.label}</p>
              <p className="mt-1 text-muted-foreground text-sm leading-relaxed">{option.hint}</p>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
