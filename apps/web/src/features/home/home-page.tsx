// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { useCurrentUser, useDictationHistory, useMeetingSessions, useNotes } from "@looper/data";
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
    labelKey: "nav.memory",
    hintKey: "home.quickStartHint",
    icon: IconMessage,
  },
  {
    to: "/library",
    labelKey: "nav.notes",
    hintKey: "home.reviewLibraryHint",
    icon: IconFileText,
  },
];

export function HomePage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const { user } = useCurrentUser();
  const transcriptions = useDictationHistory();
  const notes = useNotes();
  const meetings = useMeetingSessions();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;

  const firstName = user?.email?.split("@")[0] ?? null;

  return (
    <ProductPageLayout width="compact">
      <ProductPageHeader
        eyebrow={t("nav.home")}
        title={firstName ? t("home.greeting", { name: firstName }) : t("home.greetingGeneric")}
        description={t("home.subtitle")}
      />

      {capabilities.length > 0 ? (
        <section
          aria-labelledby="home-capabilities"
          className="web-product-panel overflow-hidden rounded-xl"
        >
          <div className="border-border border-b px-5 py-4 sm:px-6">
            <Eyebrow>{t("home.startSomething")}</Eyebrow>
            <h2
              id="home-capabilities"
              className="mt-2 font-medium text-wrap-balance text-xl tracking-tight"
            >
              {t("home.chooseOutcome")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-border">
            {capabilities.map(({ to, labelKey, hintKey, icon: Icon }, index) => (
              <Link
                key={to}
                to={to}
                className={`group flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6 ${
                  index > 0 ? "border-border border-t sm:border-t-0" : ""
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--web-highlight)] text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">{t(labelKey)}</span>
                  <span className="mt-1 block text-pretty text-muted-foreground text-xs leading-relaxed">
                    {t(hintKey)}
                  </span>
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

      <section
        aria-labelledby="home-workspace-status"
        aria-busy={transcriptions.isLoading || notes.isLoading || meetings.isLoading}
        className="mt-5 border-border border-y py-4"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>{t("home.workspaceStatus")}</Eyebrow>
            <h2 id="home-workspace-status" className="mt-2 font-medium text-sm">
              {t("home.syncedContent")}
            </h2>
          </div>
          <Link
            to="/library"
            search={{ note: undefined }}
            className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary text-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-10"
          >
            {t("home.viewLibrary")}
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-4">
          <ContentCount
            label={t("library.transcriptions")}
            value={transcriptions.items.length}
            isLoading={transcriptions.isLoading}
          />
          <ContentCount
            label={t("library.notes")}
            value={notes.notes.length}
            isLoading={notes.isLoading}
          />
          <ContentCount
            label={t("library.meetings")}
            value={meetings.sessions.length}
            isLoading={meetings.isLoading}
          />
        </dl>
      </section>
    </ProductPageLayout>
  );
}

function ContentCount({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: number;
  isLoading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 mt-1 truncate text-muted-foreground text-xs">{label}</dt>
      <dd className="order-1 font-display text-xl tabular-nums tracking-tight">
        {isLoading ? "—" : value}
      </dd>
    </div>
  );
}
