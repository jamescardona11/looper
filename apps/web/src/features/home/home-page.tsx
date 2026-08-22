// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { useCurrentUser } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowRight, IconFileText, IconMessage } from "@tabler/icons-react";
import { Link, Navigate } from "@tanstack/react-router";
import type { AppPath } from "@/app/navigation";
import { useAuth } from "@/features/auth";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";

const capabilities: ReadonlyArray<{
  to: AppPath;
  labelKey: string;
  hintKey: string;
  icon: typeof IconArrowRight;
}> = [
  {
    to: "/agent",
    labelKey: "nav.chat",
    hintKey: "home.quickStartHint",
    icon: IconMessage,
  },
  {
    to: "/library",
    labelKey: "nav.library",
    hintKey: "home.reviewLibraryHint",
    icon: IconFileText,
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const { user } = useCurrentUser();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;

  const firstName = user?.email?.split("@")[0] ?? null;

  return (
    <ProductPageLayout width="compact">
      <ProductPageHeader
        eyebrow={t("home.workspace")}
        title={firstName ? t("home.greeting", { name: firstName }) : t("home.greetingGeneric")}
        description={t("home.subtitle")}
      />

      {capabilities.length > 0 ? (
        <section
          aria-labelledby="home-capabilities"
          className="web-product-highlight rounded-xl p-4 sm:p-5"
        >
          <Eyebrow>{t("home.startSomething")}</Eyebrow>
          <h2 id="home-capabilities" className="mt-2 font-medium text-xl tracking-tight">
            {t("home.chooseOutcome")}
          </h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            {capabilities.map(({ to, labelKey, hintKey, icon: Icon }, index) => (
              <Link
                key={to}
                to={to}
                className={`group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5 ${
                  index > 0 ? "border-border border-t" : ""
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">{t(labelKey)}</span>
                  <span className="mt-0.5 block text-muted-foreground text-xs">{t(hintKey)}</span>
                </span>
                <IconArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="border-border border-y py-10">
          <Eyebrow>{t("home.workspaceStatus")}</Eyebrow>
          <h2 className="mt-3 font-medium text-xl tracking-tight">{t("home.greetingGeneric")}</h2>
          <p className="mt-2 max-w-xl text-muted-foreground text-sm">{t("home.subtitle")}</p>
        </section>
      )}
    </ProductPageLayout>
  );
}
