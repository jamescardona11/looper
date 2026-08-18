import { useTranslation } from "@looper/i18n/react";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PublicPageLayout } from "@/shared/components/public-page-layout";
import { Badge } from "@/shared/components/ui/badge";
import { type ChangeType, changelog, formatChangelogDate } from "./entries";

// Each change type reads as a semantic token badge: additions = success,
// changes/fixes = neutral info/muted. Keeps the three categories distinct
// without raw palette literals.
const TYPE_VARIANT: Record<ChangeType, "success" | "secondary" | "muted"> = {
  added: "success",
  changed: "secondary",
  fixed: "muted",
};

export function ChangelogPage() {
  const { t } = useTranslation();

  const TYPE_LABEL: Record<ChangeType, string> = {
    added: t("changelog.added"),
    changed: t("changelog.changed"),
    fixed: t("changelog.fixed"),
  };

  return (
    <PublicPageLayout>
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-12 max-w-2xl">
          <Eyebrow className="text-primary">{t("landing.footer.changelog")}</Eyebrow>
          <h1 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("changelog.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("changelog.subtitle")}</p>
        </header>

        <div className="border-border border-t">
          {changelog.map((entry) => (
            <section
              key={entry.version}
              className="grid gap-5 border-border border-b py-8 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8"
            >
              <div>
                <h2 className="font-display font-semibold text-foreground text-xl tabular-nums tracking-tight">
                  {entry.version}
                </h2>
                {entry.date ? (
                  <time
                    className="font-mono text-muted-foreground text-sm tabular-nums"
                    dateTime={entry.date}
                  >
                    {formatChangelogDate(entry.date)}
                  </time>
                ) : null}
              </div>
              <div>
                {entry.summary ? (
                  <p className="text-muted-foreground text-sm leading-relaxed">{entry.summary}</p>
                ) : null}

                <div className="mt-5 flex flex-col gap-5">
                  {entry.changes.map((group) => (
                    <div key={group.type}>
                      <Badge
                        variant={TYPE_VARIANT[group.type]}
                        className="font-mono text-[10px] uppercase tracking-wide"
                      >
                        {TYPE_LABEL[group.type]}
                      </Badge>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-foreground/90 text-sm">
                        {group.items.map((item) => (
                          <li key={item} className="leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </PublicPageLayout>
  );
}
