import { useLingui } from "@lingui/react/macro";
import { Check, CircleNotch as Loader2, FileText } from "@phosphor-icons/react";
import ActionCardButton from "../../../../shared/ui/ActionCardButton";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import type { StorageMetric, StorageMetricKey } from "./about-tab-model";

const metricLabel = (
  key: StorageMetricKey,
  t: ReturnType<typeof useLingui>["t"],
): string => {
  const labels = {
    recordings: t({
      id: "settings.about.storage.recordings",
      message: "Recordings",
    }),
    library: t({ id: "settings.about.storage.library", message: "Library" }),
    models: t({ id: "settings.about.storage.models", message: "Models" }),
    database: t({
      id: "settings.about.storage.database",
      message: "Database",
    }),
    total: t({ id: "settings.about.storage.total", message: "Total" }),
  };
  return labels[key];
};

export function AboutStorage({
  metrics,
  dataPath,
  formatBytes,
  exportStatus,
  onOpenDataDir,
  onExportArchive,
}: {
  metrics: StorageMetric[];
  dataPath: string | null;
  formatBytes: (bytes: number) => string;
  exportStatus: "idle" | "exporting" | "complete";
  onOpenDataDir: () => void;
  onExportArchive: () => void;
}) {
  const { t } = useLingui();
  const exporting = exportStatus === "exporting";
  const complete = exportStatus === "complete";
  return (
    <section className="space-y-2">
      <SectionLabel>
        {t({ id: "settings.about.storage", message: "Storage" })}
      </SectionLabel>
      <div className="space-y-4 px-1">
        <div className="grid grid-cols-5 gap-x-6 gap-y-3">
          {metrics.map((metric) => (
            <div key={metric.key} className="min-w-0">
              <p className="ui-text-micro ui-color-disabled">
                {metricLabel(metric.key, t)}
              </p>
              <p
                className={`mt-1 truncate font-mono tabular-nums ui-text-meta ${
                  metric.primary ? "ui-color-primary" : "ui-color-secondary"
                }`}
              >
                {formatBytes(metric.bytes)}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenDataDir}
          disabled={!dataPath}
          title={dataPath ?? undefined}
          className="block w-full min-w-0 truncate text-left font-mono ui-text-meta ui-color-muted transition-colors hover:ui-color-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="border-b border-dotted border-content-disabled/70 pb-px">
            {dataPath ?? "-"}
          </span>
        </button>

        <ActionCardButton
          onClick={onExportArchive}
          disabled={exporting}
          title={
            exporting
              ? t({
                  id: "settings.about.export.exporting",
                  message: "Exporting…",
                })
              : complete
                ? t({
                    id: "settings.about.export.complete",
                    message: "Export complete",
                  })
                : t({
                    id: "settings.about.export.action",
                    message: "Export all data",
                  })
          }
          description={t({
            id: "settings.about.export.description",
            message:
              "History, Library, translations and available audio in one ZIP",
          })}
          icon={
            exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : complete ? (
              <Check size={14} />
            ) : (
              <FileText size={14} />
            )
          }
          accentPreset="cloud"
        />
      </div>
    </section>
  );
}
