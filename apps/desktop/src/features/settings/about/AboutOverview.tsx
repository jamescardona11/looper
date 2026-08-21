import { useLingui } from "@lingui/react/macro";
import { FileText } from "@phosphor-icons/react";
import SectionLabel from "../../../shared/ui/SectionLabel";
import { UpdateChecker } from "../../updates/components/UpdateChecker";
import type { TranscriptionMode } from "../../../types/index";

const supportActionClass =
  "group flex h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border-primary bg-surface-surface outline-hidden transition-[transform,border-color,background-color] duration-100 ease-out hover:border-[var(--color-accent-30)] hover:bg-[var(--color-accent-10)] active:translate-y-[2px] focus-visible:ring-2 focus-visible:ring-border-hover";

export function AboutOverview({
  version,
  transcriptionMode,
  onShowLogs,
}: {
  version: string | null;
  transcriptionMode: TranscriptionMode;
  onShowLogs: () => void;
}) {
  const { t } = useLingui();
  const mode =
    transcriptionMode === "cloud"
      ? t({ id: "settings.about.mode.cloud", message: "Cloud" })
      : t({ id: "settings.about.mode.local", message: "Local" });

  return (
    <>
      <header>
        <h1 className="ui-text-title-lg font-medium ui-color-primary">
          {t({ id: "settings.about.version_label", message: "Looper" })}
        </h1>
        <p className="mt-1 ui-text-body-sm ui-color-muted">
          {t({ id: "settings.about.version", message: "Version" })}{" "}
          <span className="font-mono tabular-nums">{version ?? "-"}</span>
          <span aria-hidden="true" className="mx-1.5 ui-color-disabled">
            ·
          </span>
          {mode}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <SectionLabel>
            {t({ id: "settings.about.updates", message: "Updates" })}
          </SectionLabel>
          <UpdateChecker />
        </div>
        <div className="space-y-2">
          <SectionLabel>
            {t({ id: "settings.about.support", message: "Support" })}
          </SectionLabel>
          <button
            type="button"
            onClick={onShowLogs}
            className={supportActionClass}
          >
            <FileText
              size={14}
              aria-hidden="true"
              className="ui-color-muted transition-colors group-hover:ui-color-primary"
            />
            <span className="ui-text-micro ui-color-secondary transition-colors group-hover:ui-color-primary">
              {t({ id: "settings.about.show_logs", message: "Logs" })}
            </span>
          </button>
        </div>
      </section>
    </>
  );
}
