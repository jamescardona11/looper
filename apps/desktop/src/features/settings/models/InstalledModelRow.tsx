import { useLingui } from "@lingui/react/macro";
import { Check, Clock, Trash, Waveform } from "@phosphor-icons/react";

import {
  hasModelCapability,
  MODEL_CAPABILITY_STREAMING,
  MODEL_CAPABILITY_TIMESTAMPS,
} from "../../../shared/lib/modelCapabilities";
import {
  deriveModelStats,
  formatModelSize,
  formatQuantLabel,
} from "../../../shared/lib/modelStats";
import type { ModelInfo } from "../../../types/index";

export type InstalledModelRowProps = Record<"model", ModelInfo> &
  Record<"active" | "aneInstalled" | "revealDelete", boolean> &
  Record<"onUse" | "onDelete", () => void>;

type InstalledModelIdentityProps = Pick<
  InstalledModelRowProps,
  "model" | "active" | "onUse"
> & {
  facts: string[];
  streaming: boolean;
  timestamps: boolean;
};

const DELETE_BUTTON = [
  "flex h-6 w-6 items-center justify-center rounded-md transition-all",
  "hover:bg-error/10 hover:text-error",
].join(" ");
const HIDDEN_DELETE = [
  "text-content-disabled opacity-0 group-hover:opacity-100",
  "focus-visible:opacity-100 focus-visible:text-error",
].join(" ");

export function InstalledModelRow(props: InstalledModelRowProps) {
  const { t } = useLingui();
  const stats = deriveModelStats(props.model);
  const facts = [
    stats.englishOnly
      ? t({ id: "settings.models.installed.english", message: `English` })
      : t({
          id: "settings.models.installed.multilingual",
          message: `Multilingual`,
        }),
    formatModelSize(
      props.model.size_mb +
        (props.aneInstalled ? (props.model.ane_size_mb ?? 0) : 0),
    ),
  ];
  const quantization = formatQuantLabel(props.model.variant);
  if (quantization) facts.push(quantization);
  if (props.aneInstalled) {
    facts.push(t({ id: "settings.models.installed.ane", message: `ANE` }));
  }
  return (
    <article className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-elevated/40">
      <InstalledModelIdentity
        model={props.model}
        active={props.active}
        facts={facts}
        streaming={hasModelCapability(props.model, MODEL_CAPABILITY_STREAMING)}
        timestamps={hasModelCapability(
          props.model,
          MODEL_CAPABILITY_TIMESTAMPS,
        )}
        onUse={props.onUse}
      />
      <InstalledModelActions {...props} />
    </article>
  );
}

function InstalledModelIdentity({
  model,
  active,
  facts,
  streaming,
  timestamps,
  onUse,
}: InstalledModelIdentityProps) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={onUse}
      disabled={active}
      className="min-w-0 text-left disabled:cursor-default"
    >
      <span className="flex min-w-0 items-center gap-1.5 ui-text-body-sm-strong ui-color-primary">
        <span className="truncate">{model.label}</span>
        {!model.downloadable ? (
          <span className="shrink-0 font-normal ui-color-muted">
            {t({ id: "settings.models.installed.legacy", message: `Legacy` })}
          </span>
        ) : null}
        {streaming ? (
          <Waveform
            size={13}
            aria-label={t({
              id: "settings.models.capability.streaming",
              message: `Live streaming`,
            })}
            className="shrink-0 ui-color-muted"
          />
        ) : null}
        {timestamps ? (
          <Clock
            size={13}
            aria-label={t({
              id: "settings.models.capability.timestamps",
              message: `Word-level timestamps`,
            })}
            className="shrink-0 ui-color-muted"
          />
        ) : null}
      </span>
      <span className="mt-0.5 block tabular-nums ui-text-meta ui-color-muted">
        {facts.join("  ·  ")}
      </span>
    </button>
  );
}

function InstalledModelActions(props: InstalledModelRowProps) {
  const { t } = useLingui();
  const deleteTone = props.revealDelete
    ? "text-error opacity-100"
    : HIDDEN_DELETE;
  return (
    <div className="flex items-center justify-end gap-2">
      {props.active ? (
        <span className="flex items-center gap-1 font-medium ui-text-meta ui-color-local">
          <Check size={12} aria-hidden="true" />
          {t({ id: "settings.models.installed.active", message: `Active` })}
        </span>
      ) : (
        <button
          type="button"
          onClick={props.onUse}
          className="font-medium ui-text-meta ui-color-secondary transition-colors hover:ui-color-primary"
        >
          {t({ id: "settings.models.installed.use", message: `Use` })}
        </button>
      )}
      <button
        type="button"
        onClick={props.onDelete}
        className={`${DELETE_BUTTON} ${deleteTone}`}
        title={t({ id: "settings.models.installed.delete", message: `Delete` })}
        aria-label={t({
          id: "settings.models.installed.delete_model",
          message: `Delete model`,
        })}
      >
        <Trash size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
