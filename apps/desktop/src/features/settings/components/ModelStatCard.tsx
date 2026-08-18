import type { MouseEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  Check,
  Download,
  Square,
  Trash as Trash2,
} from "@phosphor-icons/react";
import ModelCardShell from "./ModelCardShell";
import ActivityDots from "../../../shared/ui/ActivityDots";
import {
  buildModelCardPresentation,
  type ModelCardAction,
  type ModelCardActivity,
} from "../model-card-presentation";
import type { DownloadEvent, ModelInfo, ModelStatus } from "../../../types";

type ModelStatCardProps = {
  model: ModelInfo;
  status?: ModelStatus;
  progress?: DownloadEvent;
  width?: number;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  showActions?: boolean;
  onDownload?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
};

const ModelStatCard = ({
  model,
  status,
  progress,
  width,
  compact = false,
  selected,
  onSelect,
  showActions = true,
  onDownload,
  onDelete,
  onCancel,
}: ModelStatCardProps) => {
  const { t } = useLingui();
  const presentation = buildModelCardPresentation(
    model,
    status,
    progress,
    compact,
    showActions,
  );
  const handlers: Record<
    Exclude<ModelCardAction, null>,
    (() => void) | undefined
  > = {
    cancel: onCancel,
    delete: onDelete,
    download: onDownload,
  };

  return (
    <ModelCardShell
      accent={presentation.accent}
      glowStrong={presentation.glowStrong}
      glowSoft={presentation.glowSoft}
      dots={presentation.dots}
      animated={presentation.animated}
      width={width}
      onClick={onSelect}
      selected={selected}
      ariaLabel={t({
        id: "models.card.aria",
        message: `${model.label} model`,
      })}
    >
      <div className="px-5 pb-4 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[1.1875rem] font-[650] tracking-[-0.015em] ui-color-primary">
            {model.label}
          </h3>
          {onSelect && (
            <span
              aria-hidden="true"
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
                selected
                  ? "border-[var(--color-success)] bg-[var(--color-success)] text-black"
                  : "border-border-secondary text-transparent"
              }`}
            >
              <Check size={12} weight="bold" />
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <ActivityLabel activity={presentation.activity} />
          {presentation.action && (
            <ModelActionButton
              action={presentation.action}
              onAction={handlers[presentation.action]}
            />
          )}
        </div>
      </div>
    </ModelCardShell>
  );
};

const ActivityLabel = ({ activity }: { activity: ModelCardActivity }) => {
  const { t } = useLingui();
  if (activity.kind === "verifying") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <ActivityDots />
        <span className="truncate font-mono text-[11.5px] tabular-nums ui-color-muted">
          {t({ id: "models.card.verifying", message: "Verifying install" })}
        </span>
      </div>
    );
  }
  if (activity.kind === "downloading") {
    return (
      <p
        className="min-w-0 truncate font-mono text-[11.5px] tabular-nums ui-color-muted"
        title={activity.fileName ?? undefined}
      >
        {activity.fileName ??
          t({ id: "models.card.downloading", message: "Downloading" })}
      </p>
    );
  }
  return (
    <p className="min-w-0 truncate font-mono text-[11.5px] tabular-nums ui-color-muted">
      {activity.facts.join("  ·  ")}
    </p>
  );
};

const actionMetadata = {
  cancel: {
    title: { id: "models.card.cancel", message: "Cancel" },
    aria: { id: "models.card.cancel_download", message: "Cancel download" },
    className: "text-error hover:bg-error/10",
    icon: <Square size={11} fill="currentColor" aria-hidden="true" />,
  },
  delete: {
    title: { id: "models.card.delete", message: "Delete" },
    aria: { id: "models.card.delete_model", message: "Delete model" },
    className: "text-content-disabled hover:bg-error/10 hover:text-error",
    icon: <Trash2 size={13} aria-hidden="true" />,
  },
  download: {
    title: { id: "models.card.download", message: "Download" },
    aria: { id: "models.card.download_model", message: "Download model" },
    className:
      "text-[var(--color-success)] hover:bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]",
    icon: <Download size={13} aria-hidden="true" />,
  },
} as const;

const ModelActionButton = ({
  action,
  onAction,
}: {
  action: Exclude<ModelCardAction, null>;
  onAction?: () => void;
}) => {
  const { t } = useLingui();
  const metadata = actionMetadata[action];
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAction?.();
  };

  return (
    <button
      type="button"
      onClick={activate}
      onKeyDown={(event) => event.stopPropagation()}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${metadata.className}`}
      title={t(metadata.title)}
      aria-label={t(metadata.aria)}
    >
      {metadata.icon}
    </button>
  );
};

export default ModelStatCard;
