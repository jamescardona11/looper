import { useAudioUsage } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconClock, IconCloud, IconDatabase, IconMicrophone } from "@tabler/icons-react";
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
        eyebrow={t("usage.cloudScope")}
        title={t("usage.audioTitle")}
        description={t("usage.audioSubtitle")}
      />

      {isLoading ? (
        <UsageLoading />
      ) : !usage || usage.month.transcriptions === 0 ? (
        <UsageEmpty />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={IconMicrophone}
              label={t("usage.transcriptions")}
              value={formatNumber(usage.month.transcriptions, locale)}
              detail={t("usage.completedDetail", {
                completed: usage.month.completed,
                failed: usage.month.failed,
              })}
            />
            <MetricCard
              icon={IconClock}
              label={t("usage.audioDuration")}
              value={formatDuration(usage.month.durationMs, locale)}
              detail={t("usage.knownDurationHint")}
            />
            <MetricCard
              icon={IconCloud}
              label={t("usage.processedAudio")}
              value={formatBytes(usage.month.processedBytes, locale)}
              detail={t("usage.processedAudioHint")}
            />
            <MetricCard
              icon={IconDatabase}
              label={t("usage.storedAudio")}
              value={formatBytes(usage.month.storedBytes, locale)}
              detail={t("usage.storedAudioHint")}
            />
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

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof IconMicrophone;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-5">
      <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <Eyebrow className="mt-5">{label}</Eyebrow>
      <p className="mt-2 font-display text-3xl tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{detail}</p>
    </Card>
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
    <Card className="flex min-h-80 flex-col items-start justify-center p-8 sm:p-12">
      <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary">
        <IconMicrophone className="size-5" aria-hidden />
      </span>
      <h2 className="mt-5 font-medium text-2xl tracking-tight">{t("usage.emptyAudioTitle")}</h2>
      <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-relaxed">
        {t("usage.emptyAudioHint")}
      </p>
      <Link
        to="/transcribe"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 font-medium text-primary-foreground text-sm"
      >
        {t("usage.transcribeAudio")}
      </Link>
    </Card>
  );
}

function UsageLoading() {
  return (
    <section className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {["transcriptions", "duration", "audio", "storage"].map((metric) => (
        <Card key={metric} className="h-44 bg-secondary/30" />
      ))}
    </section>
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
