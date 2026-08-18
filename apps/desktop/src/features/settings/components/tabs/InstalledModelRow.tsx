import { useLingui } from "@lingui/react/macro";
import { Check, Clock, Trash as Trash2, Waveform } from "@phosphor-icons/react";
import {
  deriveModelStats,
  formatModelSize,
  formatQuantLabel,
} from "../../../../shared/lib/modelStats";
import {
  hasModelCapability,
  MODEL_CAPABILITY_STREAMING,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../../shared/lib/modelCapabilities";
import type { ModelInfo } from "../../../../types";

export function InstalledModelRow({
  model,
  active,
  aneInstalled,
  revealDelete,
  onUse,
  onDelete,
}: {
  model: ModelInfo;
  active: boolean;
  aneInstalled: boolean;
  revealDelete: boolean;
  onUse: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const stats = deriveModelStats(model);
  const facts = [
    stats.englishOnly
      ? t({ id: "settings.models.installed.english", message: "English" })
      : t({
          id: "settings.models.installed.multilingual",
          message: "Multilingual",
        }),
    formatModelSize(
      model.size_mb + (aneInstalled ? (model.ane_size_mb ?? 0) : 0),
    ),
  ];
  const quantization = formatQuantLabel(model.variant);
  if (quantization) facts.push(quantization);
  if (aneInstalled) {
    facts.push(t({ id: "settings.models.installed.ane", message: "ANE" }));
  }
  const streaming = hasModelCapability(model, MODEL_CAPABILITY_STREAMING);
  const timestamps = hasModelCapability(model, MODEL_CAPABILITY_TIMESTAMPS);

  return (
    <article className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-elevated/40">
      <button
        type="button"
        onClick={onUse}
        disabled={active}
        className="min-w-0 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-1.5 ui-text-body-sm-strong ui-color-primary">
          <span className="truncate">{model.label}</span>
          {!model.downloadable && (
            <span className="shrink-0 font-normal ui-color-muted">
              {t({ id: "settings.models.installed.legacy", message: "Legacy" })}
            </span>
          )}
          {streaming && (
            <Waveform
              size={13}
              aria-label={t({
                id: "settings.models.capability.streaming",
                message: "Live streaming",
              })}
              className="shrink-0 ui-color-muted"
            />
          )}
          {timestamps && (
            <Clock
              size={13}
              aria-label={t({
                id: "settings.models.capability.timestamps",
                message: "Word-level timestamps",
              })}
              className="shrink-0 ui-color-muted"
            />
          )}
        </span>
        <span className="mt-0.5 block tabular-nums ui-text-meta ui-color-muted">
          {facts.join("  ·  ")}
        </span>
      </button>

      <div className="flex items-center justify-end gap-2">
        {active ? (
          <span className="flex items-center gap-1 font-medium ui-text-meta ui-color-local">
            <Check size={12} aria-hidden="true" />
            {t({ id: "settings.models.installed.active", message: "Active" })}
          </span>
        ) : (
          <button
            type="button"
            onClick={onUse}
            className="font-medium ui-text-meta ui-color-secondary transition-colors hover:ui-color-primary"
          >
            {t({ id: "settings.models.installed.use", message: "Use" })}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-error/10 hover:text-error ${
            revealDelete
              ? "text-error opacity-100"
              : "text-content-disabled opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:text-error"
          }`}
          title={t({
            id: "settings.models.installed.delete",
            message: "Delete",
          })}
          aria-label={t({
            id: "settings.models.installed.delete_model",
            message: "Delete model",
          })}
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
