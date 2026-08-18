import { useLingui } from "@lingui/react/macro";
import { ArrowRight, Cloud } from "@phosphor-icons/react";
import ModelCardShell, { waveDots } from "./ModelCardShell";

type CloudModelCardProps = {
  providerLabel: string;
  modelLabel: string | null;
  width?: number;
  onClick?: () => void;
};

const CloudModelCard = ({
  providerLabel,
  modelLabel,
  width,
  onClick,
}: CloudModelCardProps) => {
  const { t } = useLingui();
  const modelDescription =
    modelLabel ??
    t({
      id: "models.cloud_card.transcribing",
      message: "Cloud transcription",
    });

  return (
    <ModelCardShell
      accent="var(--model-wave-cloud)"
      glowStrong="var(--model-wave-glow-strong-cloud)"
      glowSoft="var(--model-wave-glow-soft-cloud)"
      dots={waveDots(`cloud/${providerLabel}/${modelLabel ?? "default"}`)}
      width={width}
      onClick={onClick}
      ariaLabel={t({
        id: "models.cloud_card.aria",
        message: `${providerLabel} cloud model, manage in Providers`,
      })}
    >
      <div className="px-5 pb-4 pt-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-cloud)_12%,transparent)] ui-color-cloud">
            <Cloud size={17} weight="fill" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono uppercase tracking-[0.12em] ui-text-uppercase-micro ui-color-muted">
              {t({
                id: "models.cloud_card.provider_label",
                message: "Cloud provider",
              })}
            </p>
            <h3 className="truncate tracking-[-0.015em] ui-text-title-strong ui-color-primary">
              {providerLabel}
            </h3>
          </div>
          {onClick && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border-secondary text-content-disabled transition group-hover:border-[var(--color-cloud)] group-hover:text-[var(--color-cloud)]">
              <ArrowRight size={13} weight="bold" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-primary pt-3">
          <span className="uppercase tracking-[0.1em] ui-text-uppercase-micro ui-color-disabled">
            {t({
              id: "models.cloud_card.active_model",
              message: "Active model",
            })}
          </span>
          <span
            className="min-w-0 truncate font-mono tabular-nums ui-text-meta ui-color-muted"
            title={modelDescription}
          >
            {modelDescription}
          </span>
        </div>
      </div>
    </ModelCardShell>
  );
};

export default CloudModelCard;
