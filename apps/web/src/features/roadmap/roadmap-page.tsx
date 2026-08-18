import { useTranslation } from "@looper/i18n/react";
import { IconCheck, IconCircleDashed, IconProgress } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PublicPageLayout } from "@/shared/components/public-page-layout";
import { Badge } from "@/shared/components/ui/badge";
import { type RoadmapStatus, roadmap } from "./items";

type BadgeVariant = "success" | "primary" | "muted";

const STATUS_BADGE: Record<RoadmapStatus, { variant: BadgeVariant; Icon: typeof IconCheck }> = {
  shipped: { variant: "success", Icon: IconCheck },
  "in-progress": { variant: "primary", Icon: IconProgress },
  planned: { variant: "muted", Icon: IconCircleDashed },
};

export function RoadmapPage() {
  const { t } = useTranslation();

  const SECTIONS: Array<{ status: RoadmapStatus; label: string }> = [
    { status: "shipped", label: t("roadmap.shipped") },
    { status: "in-progress", label: t("roadmap.inProgress") },
    { status: "planned", label: t("roadmap.planned") },
  ];
  const visibleSections = SECTIONS.filter((section) =>
    roadmap.some((item) => item.status === section.status),
  );

  return (
    <PublicPageLayout>
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-12 max-w-2xl">
          <Eyebrow className="text-primary">{t("landing.footer.roadmap")}</Eyebrow>
          <h1 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("roadmap.title")}
          </h1>
          <p className="mt-4 text-muted-foreground">{t("roadmap.subtitle")}</p>
        </header>

        <div
          className={cn(
            "grid gap-10",
            visibleSections.length > 2
              ? "lg:grid-cols-3"
              : visibleSections.length === 2
                ? "lg:grid-cols-2"
                : "lg:grid-cols-1",
          )}
        >
          {visibleSections.map((section) => {
            const items = roadmap.filter((item) => item.status === section.status);
            const { variant, Icon } = STATUS_BADGE[section.status];
            return (
              <section key={section.status}>
                <h2 className="border-border border-b pb-4">
                  <Badge variant={variant} className="gap-1.5 font-mono uppercase tracking-wide">
                    <Icon className="size-4" aria-hidden="true" />
                    {section.label}
                  </Badge>
                </h2>
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li className="py-5" key={item.title}>
                      <h3 className="font-medium text-foreground">{item.title}</h3>
                      <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                        {item.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </PublicPageLayout>
  );
}
