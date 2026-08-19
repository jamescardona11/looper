import { useState, type ComponentProps } from "react";
import { motion, type Variants } from "framer-motion";

import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
  RemoteSpeechProvider,
  TranscriptionMode,
} from "../../../../types";
import { ModelBrowser } from "./ModelBrowser";
import { ModelsOverview } from "./ModelsOverview";

type ModelOperations = Record<"setLocalModel", (value: string) => void> &
  Record<"handleDownload", (modelKey: string, ane?: boolean) => void> &
  Record<"handleDelete" | "handleCancelDownload", (modelKey: string) => void> &
  Record<"onOpenGeneralTab" | "onOpenProvidersTab", () => void>;

type ModelsTabProps = ModelOperations &
  Record<"variants", Variants> &
  Record<"modelCatalog", ModelInfo[]> &
  Record<"modelStatus", Record<string, ModelStatus>> &
  Record<"downloadState", Record<string, DownloadEvent>> &
  Record<"localModel" | "remoteSpeechModel", string> &
  Record<"transcriptionMode", TranscriptionMode> &
  Record<"remoteSpeechEnabled", boolean> &
  Record<"remoteSpeechProvider", RemoteSpeechProvider>;

type ModelsRoute = "browser" | "overview";

const ModelsTab = ({ variants, ...models }: ModelsTabProps) => {
  const [route, setRoute] = useState<ModelsRoute>("overview");
  const browserProperties: ComponentProps<typeof ModelBrowser> = {
    catalog: models.modelCatalog,
    status: models.modelStatus,
    progress: models.downloadState,
    activeKey: models.localModel,
    onBack: () => setRoute("overview"),
    onUse: models.setLocalModel,
    onDownload: models.handleDownload,
    onDelete: models.handleDelete,
    onCancel: models.handleCancelDownload,
  };
  const overviewProperties: ComponentProps<typeof ModelsOverview> = {
    catalog: models.modelCatalog,
    status: models.modelStatus,
    progress: models.downloadState,
    localModel: models.localModel,
    transcriptionMode: models.transcriptionMode,
    remoteSpeechEnabled: models.remoteSpeechEnabled,
    remoteSpeechProvider: models.remoteSpeechProvider,
    remoteSpeechModel: models.remoteSpeechModel,
    onUse: models.setLocalModel,
    onDownload: models.handleDownload,
    onDelete: models.handleDelete,
    onCancel: models.handleCancelDownload,
    onBrowse: () => setRoute("browser"),
    onOpenGeneral: models.onOpenGeneralTab,
    onOpenProviders: models.onOpenProvidersTab,
  };

  return (
    <motion.div
      key="models"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex h-full flex-col"
    >
      {route === "browser" ? (
        <ModelBrowser {...browserProperties} />
      ) : (
        <ModelsOverview {...overviewProperties} />
      )}
    </motion.div>
  );
};

export default ModelsTab;
