import {
  ArrowClockwise,
  Check,
  Stop,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import {
  useModelDownloadActivity,
  type ModelDownloadActivity,
} from "../modelDownloadActivity";

const formatDownloadBytes = (bytes: number) => {
  const safeBytes = Math.max(0, bytes);
  if (safeBytes >= 1_000_000_000) {
    return `${(safeBytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (safeBytes >= 1_000_000) {
    return `${Math.round(safeBytes / 1_000_000)} MB`;
  }
  return `${Math.round(safeBytes / 1_000)} KB`;
};

const statusLabel = (
  activity: ModelDownloadActivity,
  labels: {
    downloading: string;
    verifying: string;
    complete: string;
    cancelled: string;
    error: string;
  },
) => labels[activity.status];

export default function ModelDownloadActivityBar() {
  const { t } = useLingui();
  const { activities, cancel, retry, dismiss } = useModelDownloadActivity();
  const visible = Object.values(activities).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  if (visible.length === 0) return null;

  const labels = {
    downloading: t({
      id: "models.download_activity.downloading",
      message: "Downloading",
    }),
    verifying: t({
      id: "models.download_activity.verifying",
      message: "Verifying",
    }),
    complete: t({
      id: "models.download_activity.complete",
      message: "Ready",
    }),
    cancelled: t({
      id: "models.download_activity.cancelled",
      message: "Cancelled",
    }),
    error: t({
      id: "models.download_activity.error",
      message: "Download failed",
    }),
  };

  return (
    <aside
      aria-label={t({
        id: "models.download_activity.region",
        message: "Model downloads",
      })}
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[220] flex w-[min(420px,calc(100vw-40px))] flex-col gap-2"
    >
      {visible.map((activity) => {
        const active =
          activity.status === "downloading" || activity.status === "verifying";
        const failed =
          activity.status === "error" || activity.status === "cancelled";
        const totalLabel = formatDownloadBytes(activity.totalBytes);
        const downloadedLabel = formatDownloadBytes(activity.downloadedBytes);

        return (
          <div
            key={activity.model}
            className="pointer-events-auto overflow-hidden rounded-xl border border-border-secondary bg-surface-overlay shadow-2xl shadow-black/35"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                  activity.status === "complete"
                    ? "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-[var(--color-success)]"
                    : failed
                      ? "bg-error/10 text-error"
                      : "bg-[color-mix(in_srgb,var(--color-cloud)_14%,transparent)] text-[var(--color-cloud)]"
                }`}
              >
                {activity.status === "complete" ? (
                  <Check size={14} weight="bold" aria-hidden="true" />
                ) : failed ? (
                  <WarningCircle size={15} aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate ui-text-label font-semibold text-content-primary">
                    {activity.label}
                  </p>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-content-muted">
                    {active
                      ? `${Math.round(activity.percent)}%`
                      : labels[activity.status]}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center justify-between gap-3 ui-text-meta text-content-muted">
                  <span className="truncate">
                    {statusLabel(activity, labels)}
                    {activity.status === "verifying" && activity.file
                      ? ` · ${activity.file.split("/").pop()}`
                      : ""}
                  </span>
                  {activity.totalBytes > 0 ? (
                    <span className="shrink-0 font-mono tabular-nums">
                      {active
                        ? `${downloadedLabel} / ${totalLabel}`
                        : totalLabel}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-primary">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      failed ? "bg-error" : "bg-[var(--color-success)]"
                    }`}
                    style={{ width: `${activity.percent}%` }}
                  />
                </div>

                {activity.error ? (
                  <p className="mt-1.5 line-clamp-2 ui-text-meta text-error">
                    {activity.error}
                  </p>
                ) : null}
              </div>

              {active ? (
                <button
                  type="button"
                  onClick={() => void cancel(activity.model)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-error/10 hover:text-error"
                  aria-label={t({
                    id: "models.download_activity.cancel",
                    message: `Cancel ${activity.label} download`,
                  })}
                >
                  <Stop size={12} weight="fill" aria-hidden="true" />
                </button>
              ) : failed ? (
                <button
                  type="button"
                  onClick={() => void retry(activity.model)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
                  aria-label={t({
                    id: "models.download_activity.retry",
                    message: `Retry ${activity.label} download`,
                  })}
                >
                  <ArrowClockwise size={14} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(activity.model)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
                  aria-label={t({
                    id: "models.download_activity.dismiss",
                    message: `Dismiss ${activity.label} download`,
                  })}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
