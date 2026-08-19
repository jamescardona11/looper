import { useLingui } from "@lingui/react/macro";

import { useShiftHeld } from "../../../../shared/hooks/useShiftHeld";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
  RemoteSpeechProvider,
  TranscriptionMode,
} from "../../../../types";
import { FeaturedModels } from "./models-overview-featured";
import { InstalledModels } from "./models-overview-installed";
import {
  cloudModelSelection,
  installedModelCatalog,
  selectLocalModel,
} from "./models-tab-model";

type ModelActions = Record<
  "onUse" | "onDelete" | "onCancel",
  (key: string) => void
> &
  Record<"onDownload", (key: string, ane?: boolean) => void> &
  Record<"onBrowse" | "onOpenGeneral" | "onOpenProviders", () => void>;

export type ModelsOverviewProps = ModelActions &
  Record<"catalog", ModelInfo[]> &
  Record<"status", Record<string, ModelStatus>> &
  Record<"progress", Record<string, DownloadEvent>> &
  Record<"localModel" | "remoteSpeechModel", string> &
  Record<"transcriptionMode", TranscriptionMode> &
  Record<"remoteSpeechEnabled", boolean> &
  Record<"remoteSpeechProvider", RemoteSpeechProvider>;

export function ModelsOverview(props: ModelsOverviewProps) {
  const { t } = useLingui();
  const selectedLocal = selectLocalModel(
    props.catalog,
    props.localModel,
    props.status,
  );
  const cloud = cloudModelSelection({
    transcriptionMode: props.transcriptionMode,
    remoteEnabled: props.remoteSpeechEnabled,
    remoteProvider: props.remoteSpeechProvider,
    remoteModel: props.remoteSpeechModel,
  });
  const providerName =
    cloud.providerLabel ??
    t({
      id: "settings.models.cloud_active.provider_fallback",
      message: `your speech provider`,
    });
  const openCloudSettings =
    cloud.settingsTarget === "general"
      ? props.onOpenGeneral
      : props.onOpenProviders;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <FeaturedModels
        cloud={cloud}
        cloudProvider={providerName}
        selectedLocal={selectedLocal}
        status={props.status}
        progress={props.progress}
        onOpenCloud={openCloudSettings}
        onDownload={props.onDownload}
        onDelete={props.onDelete}
        onCancel={props.onCancel}
      />
      <InstalledModels
        installed={installedModelCatalog(props.catalog, props.status)}
        status={props.status}
        activeKey={props.localModel}
        localMode={
          props.transcriptionMode === "local" && !props.remoteSpeechEnabled
        }
        revealDelete={useShiftHeld()}
        onBrowse={props.onBrowse}
        onUse={props.onUse}
        onDelete={props.onDelete}
      />
    </div>
  );
}
