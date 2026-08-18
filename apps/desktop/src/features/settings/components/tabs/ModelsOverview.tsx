import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { CaretRight as ChevronRight } from "@phosphor-icons/react";
import ModelStatCard from "../ModelStatCard";
import CloudModelCard from "../CloudModelCard";
import SectionLabel from "../../../../shared/ui/SectionLabel";
import { useShiftHeld } from "../../../../shared/hooks/useShiftHeld";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
  RemoteSpeechProvider,
  TranscriptionMode,
} from "../../../../types";
import { InstalledModelRow } from "./InstalledModelRow";
import {
  cloudModelSelection,
  installedModelCatalog,
  selectLocalModel,
} from "./models-tab-model";

const SIDE_BY_SIDE_WIDTH = 280;

type ModelsOverviewProps = {
  catalog: ModelInfo[];
  status: Record<string, ModelStatus>;
  progress: Record<string, DownloadEvent>;
  localModel: string;
  transcriptionMode: TranscriptionMode;
  remoteSpeechEnabled: boolean;
  remoteSpeechProvider: RemoteSpeechProvider;
  remoteSpeechModel: string;
  onUse: (key: string) => void;
  onDownload: (key: string, ane?: boolean) => void;
  onDelete: (key: string) => void;
  onCancel: (key: string) => void;
  onBrowse: () => void;
  onOpenGeneral: () => void;
  onOpenProviders: () => void;
};

export function ModelsOverview(props: ModelsOverviewProps) {
  const { t } = useLingui();
  const shiftHeld = useShiftHeld();
  const selectedLocal = selectLocalModel(
    props.catalog,
    props.localModel,
    props.status,
  );
  const installed = installedModelCatalog(props.catalog, props.status);
  const cloud = cloudModelSelection({
    transcriptionMode: props.transcriptionMode,
    remoteEnabled: props.remoteSpeechEnabled,
    remoteProvider: props.remoteSpeechProvider,
    remoteModel: props.remoteSpeechModel,
  });
  const cloudProvider =
    cloud.providerLabel ??
    t({
      id: "settings.models.cloud_active.provider_fallback",
      message: "your speech provider",
    });
  const openCloud =
    cloud.settingsTarget === "general"
      ? props.onOpenGeneral
      : props.onOpenProviders;

  const localCard = (width?: number, compact = false) =>
    selectedLocal ? (
      <ModelStatCard
        model={selectedLocal}
        status={props.status[selectedLocal.key]}
        progress={props.progress[selectedLocal.key]}
        width={width}
        compact={compact}
        onDownload={() => props.onDownload(selectedLocal.key)}
        onDelete={() => props.onDelete(selectedLocal.key)}
        onCancel={() => props.onCancel(selectedLocal.key)}
      />
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex shrink-0 items-start justify-center gap-4">
        {cloud.active && (
          <ModelSummary
            label={t({ id: "settings.models.card.active", message: "Active" })}
            cloud
          >
            <CloudModelCard
              width={selectedLocal ? SIDE_BY_SIDE_WIDTH : undefined}
              providerLabel={cloudProvider}
              modelLabel={cloud.modelLabel}
              onClick={openCloud}
            />
          </ModelSummary>
        )}
        {selectedLocal && (
          <ModelSummary
            label={
              cloud.active
                ? t({
                    id: "settings.models.card.fallback",
                    message: "Fallback",
                  })
                : null
            }
          >
            {localCard(
              cloud.active ? SIDE_BY_SIDE_WIDTH : undefined,
              cloud.active,
            )}
          </ModelSummary>
        )}
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center gap-3">
          <SectionLabel className="flex-1">
            {t({ id: "settings.models.installed", message: "Installed" })}
          </SectionLabel>
          <button
            type="button"
            onClick={props.onBrowse}
            className="group inline-flex shrink-0 items-center gap-1 ui-text-body-sm-strong ui-color-secondary transition-colors hover:ui-color-primary"
          >
            {t({
              id: "settings.models.browse_all",
              message: "Browse all models",
            })}
            <ChevronRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
          {installed.map((model) => (
            <InstalledModelRow
              key={model.key}
              model={model}
              active={
                props.transcriptionMode === "local" &&
                !props.remoteSpeechEnabled &&
                model.key === props.localModel
              }
              aneInstalled={Boolean(props.status[model.key]?.ane_installed)}
              revealDelete={shiftHeld}
              onUse={() => props.onUse(model.key)}
              onDelete={() => props.onDelete(model.key)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

const ModelSummary = ({
  label,
  cloud = false,
  children,
}: {
  label: string | null;
  cloud?: boolean;
  children: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-2">
    {children}
    {label && (
      <span
        className={`ui-text-meta ${cloud ? "ui-color-cloud" : "ui-color-muted"}`}
      >
        {label}
      </span>
    )}
  </div>
);
