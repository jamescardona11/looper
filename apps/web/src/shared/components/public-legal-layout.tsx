import { useTranslation } from "@looper/i18n/react";
import type { ReactNode } from "react";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PageSurface } from "@/shared/components/page-surface";
import { PublicPageNav } from "@/shared/components/public-page-nav";

type LegalSectionLink = {
  id: string;
  title: string;
};

type PublicLegalLayoutProps = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSectionLink[];
  children: ReactNode;
};

export function PublicLegalLayout({
  title,
  lastUpdated,
  intro,
  sections,
  children,
}: PublicLegalLayoutProps) {
  const { t } = useTranslation();

  return (
    <PageSurface className="min-h-screen">
      <PublicPageNav />
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="max-w-3xl border-border border-b pb-10">
          <Eyebrow className="text-primary">{t("legal.eyebrow")}</Eyebrow>
          <h1 className="mt-4 font-bold font-display text-4xl leading-[0.95] tracking-tighter md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground leading-relaxed">{intro}</p>
          <p className="mt-6 font-mono text-muted-foreground text-xs uppercase tracking-wide">
            {t("legal.lastUpdated")}: {lastUpdated}
          </p>
        </header>

        <div className="grid gap-12 pt-10 lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav className="sticky top-8" aria-label={t("legal.onThisPage")}>
              <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
                {t("legal.onThisPage")}
              </p>
              <ol className="mt-4 space-y-3">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                    >
                      {section.title.replace(/^\d+\.\s*/, "")}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="min-w-0">{children}</article>
        </div>
      </div>
    </PageSurface>
  );
}

export function PublicLegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-8 border-border border-t py-8 first:border-t-0 first:pt-0"
    >
      <h2 className="font-display font-semibold text-2xl tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
