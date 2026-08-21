import type { ComponentProps, ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";

import CloudModelCard from "../providers/CloudModelCard";
import ModelStatCard from "./ModelStatCard";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
} from "../../../types/index";
import type { CloudModelSelection } from "./models-tab-model";

const PAIRED_CARD_WIDTH = 280;

type FeaturedModelsProps = Record<"cloud", CloudModelSelection> &
  Record<"cloudProvider", string> &
  Record<"selectedLocal", ModelInfo | null> &
  Record<"status", Record<string, ModelStatus>> &
  Record<"progress", Record<string, DownloadEvent>> &
  Record<"onOpenCloud", () => void> &
  Record<"onDownload" | "onDelete" | "onCancel", (key: string) => void>;

export function FeaturedModels(props: FeaturedModelsProps) {
  const { t } = useLingui();
  const paired = props.cloud.active && Boolean(props.selectedLocal);
  const local = props.selectedLocal;
  const localProperties: ComponentProps<typeof ModelStatCard> | null = local
    ? {
        model: local,
        status: props.status[local.key],
        progress: props.progress[local.key],
        width: paired ? PAIRED_CARD_WIDTH : undefined,
        compact: props.cloud.active,
        onDownload: () => props.onDownload(local.key),
        onDelete: () => props.onDelete(local.key),
        onCancel: () => props.onCancel(local.key),
      }
    : null;

  return (
    <div className="flex shrink-0 items-start justify-center gap-4">
      {props.cloud.active ? (
        <ModelSummary
          label={t({ id: "settings.models.card.active", message: `Active` })}
          cloud
        >
          <CloudModelCard
            width={local ? PAIRED_CARD_WIDTH : undefined}
            providerLabel={props.cloudProvider}
            modelLabel={props.cloud.modelLabel}
            onClick={props.onOpenCloud}
          />
        </ModelSummary>
      ) : null}
      {localProperties ? (
        <ModelSummary
          label={
            props.cloud.active
              ? t({
                  id: "settings.models.card.fallback",
                  message: `Fallback`,
                })
              : null
          }
        >
          <ModelStatCard {...localProperties} />
        </ModelSummary>
      ) : null}
    </div>
  );
}

function ModelSummary({
  label,
  cloud = false,
  children,
}: Record<"label", string | null> &
  Partial<Record<"cloud", boolean>> &
  Record<"children", ReactNode>) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      {label ? (
        <span
          className={`ui-text-meta ${cloud ? "ui-color-cloud" : "ui-color-muted"}`}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
