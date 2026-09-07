import { useAudioUsage } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconMicrophone } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { Card } from "@/shared/components/ui";

const integerFormatters = new Map<string, Intl.NumberFormat>();
const decimalFormatters = new Map<string, Intl.NumberFormat>();

export function UsageDashboard() {
  const { t, locale } = useTranslation();
  const { usage, isLoading } = useAudioUsage();

  return (
    <ProductPageLayout>
      <ProductPageHeader
        eyebrow={t("nav.insights")}
        title={t("web.insights.title")}
        description={t("web.insights.subtitle")}
      />

      {isLoading ? (
        <UsageLoading />
      ) : !usage || usage.month.transcriptions === 0 ? (
        <UsageEmpty />
      ) : (
        <>
          <section aria-labelledby="usage-month-title">
            <h2 id="usage-month-title" className="sr-only">
              {t("usage.audioTitle")}
            </h2>
            <Card className="overflow-hidden">
              <dl className="grid lg:grid-cols-[minmax(15rem,2fr)_minmax(0,3fr)]">
                <div
                  data-testid="usage-primary-metric"
                  className="border-border border-b bg-secondary/25 p-5 sm:p-6 lg:border-r lg:border-b-0"
                >
                  <dt>
                    <span className="grid size-9 place-items-center rounded-lg bg-[var(--web-highlight)] text-primary">
                      <IconMicrophone className="size-4" aria-hidden />
                    </span>
                    <span className="mt-5 block font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
                      {t("usage.transcriptions")}
                    </span>
                  </dt>
                  <dd className="mt-2">
                    <span className="block font-display text-4xl tabular-nums tracking-tight">
                      {formatNumber(usage.month.transcriptions, locale)}
                    </span>
                    <span className="mt-2 block text-muted-foreground text-xs leading-relaxed">
                      {t("usage.completedDetail", {
                        completed: usage.month.completed,
                        failed: usage.month.failed,
                      })}
                    </span>
                  </dd>
                </div>
                <div data-testid="usage-secondary-metrics" className="divide-y divide-border">
                  <SummaryMetric
                    label={t("usage.audioDuration")}
                    value={formatDuration(usage.month.durationMs, locale)}
                    detail={t("usage.knownDurationHint")}
                  />
                  <SummaryMetric
                    label={t("usage.processedAudio")}
                    value={formatBytes(usage.month.processedBytes, locale)}
                    detail={t("usage.processedAudioHint")}
                  />
                  <SummaryMetric
                    label={t("usage.storedAudio")}
                    value={formatBytes(usage.month.storedBytes, locale)}
                    detail={t("usage.storedAudioHint")}
                  />
                </div>
              </dl>
            </Card>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
            <Card className="p-5 sm:p-6">
              <Eyebrow>{t("usage.last14Days")}</Eyebrow>
              <div className="mt-6 grid h-44 grid-cols-14 items-end gap-1.5">
                {usage.daily.map((point) => {
                  const max = Math.max(
                    1,
                    ...usage.daily.map((candidate) => candidate.transcriptions),
                  );
                  const height = Math.max(
                    point.transcriptions > 0 ? 8 : 2,
                    (point.transcriptions / max) * 100,
                  );
                  return (
                    <div
                      key={point.dateMs}
                      className="flex h-full flex-col items-center justify-end gap-2"
                      title={t("usage.dayActivity", {
                        date: new Date(point.dateMs).toLocaleDateString(locale),
                        count: point.transcriptions,
                      })}
                    >
                      <div
                        className="w-full rounded-t-sm bg-primary/75"
                        style={{ height: `${height}%` }}
                      />
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {new Date(point.dateMs)
                          .toLocaleDateString(locale, { weekday: "narrow" })
                          .slice(0, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <Eyebrow>{t("usage.today")}</Eyebrow>
              <dl className="mt-5 divide-y divide-border">
                <UsageRow
                  label={t("usage.transcriptions")}
                  value={formatNumber(usage.today.transcriptions, locale)}
                />
                <UsageRow
                  label={t("usage.audioDuration")}
                  value={formatDuration(usage.today.durationMs, locale)}
                />
                <UsageRow
                  label={t("usage.processedAudio")}
                  value={formatBytes(usage.today.processedBytes, locale)}
                />
              </dl>
            </Card>
          </section>

          {Object.keys(usage.byProvider).length > 0 ? (
            <section className="mt-8">
              <Eyebrow>{t("usage.byProvider")}</Eyebrow>
              <Card className="mt-3 overflow-hidden">
                <div className="divide-y divide-border">
                  {Object.entries(usage.byProvider).map(([provider, totals]) => (
                    <div
                      key={provider}
                      className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-8"
                    >
                      <span className="font-medium capitalize">{provider}</span>
                      <span className="font-mono text-muted-foreground text-xs">
                        {t("usage.transcriptionCount", {
                          count: totals.transcriptions,
                        })}
                      </span>
                      <span className="font-mono text-xs">
                        {formatDuration(totals.durationMs, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ) : null}

          <p className="mt-6 max-w-3xl text-muted-foreground text-xs leading-relaxed">
            {t("usage.localExcluded")}
          </p>
        </>
      )}
    </ProductPageLayout>
  );
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4 sm:px-6">
      <dt className="min-w-0">
        <span className="block font-medium text-sm">{label}</span>
        <span className="mt-1 block max-w-md text-pretty text-muted-foreground text-xs leading-relaxed">
          {detail}
        </span>
      </dt>
      <dd className="font-display text-xl tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function UsageEmpty() {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="usage-empty-title"
      className="web-product-panel max-w-3xl rounded-xl p-6 sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <IconMicrophone className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="usage-empty-title" className="font-medium text-xl tracking-tight">
            {t("usage.emptyAudioTitle")}
          </h2>
          <p className="mt-1 max-w-lg text-muted-foreground text-sm leading-relaxed">
            {t("usage.emptyAudioHint")}
          </p>
        </div>
        <Link
          to="/library"
          search={{ note: undefined }}
          className="inline-flex h-11 shrink-0 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
        >
          {t("usage.viewLibrary")}
        </Link>
      </div>
    </section>
  );
}

function UsageLoading() {
  return (
    <Card className="grid animate-pulse overflow-hidden lg:grid-cols-[minmax(15rem,2fr)_minmax(0,3fr)]">
      <div className="h-48 border-border border-b bg-secondary/30 lg:border-r lg:border-b-0" />
      <div className="divide-y divide-border">
        {["duration", "audio", "storage"].map((metric) => (
          <div key={metric} className="h-16 bg-secondary/20" />
        ))}
      </div>
    </Card>
  );
}

function formatNumber(value: number, locale: string): string {
  return numberFormatter(integerFormatters, locale).format(value);
}

function formatDuration(durationMs: number, locale: string): string {
  const minutes = durationMs / 60_000;
  if (minutes < 60) {
    return `${numberFormatter(decimalFormatters, locale, {
      maximumFractionDigits: 1,
    }).format(minutes)} min`;
  }
  return `${numberFormatter(decimalFormatters, locale, {
    maximumFractionDigits: 1,
  }).format(minutes / 60)} h`;
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0] ?? "KB";
  for (const candidate of units.slice(1)) {
    if (value < 1024) break;
    value /= 1024;
    unit = candidate;
  }
  return `${numberFormatter(decimalFormatters, locale, {
    maximumFractionDigits: 1,
  }).format(value)} ${unit}`;
}

function numberFormatter(
  cache: Map<string, Intl.NumberFormat>,
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const cached = cache.get(locale);
  if (cached) return cached;

  const formatter = Intl.NumberFormat(locale, options);
  cache.set(locale, formatter);
  return formatter;
}
