import { useState } from "react";
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

type ModelsTabProps = {
  variants: Variants;
  modelCatalog: ModelInfo[];
  modelStatus: Record<string, ModelStatus>;
  downloadState: Record<string, DownloadEvent>;
  localModel: string;
  transcriptionMode: TranscriptionMode;
  remoteSpeechEnabled: boolean;
  remoteSpeechProvider: RemoteSpeechProvider;
  remoteSpeechModel: string;
  setLocalModel: (value: string) => void;
  handleDownload: (modelKey: string, ane?: boolean) => void;
  handleDelete: (modelKey: string) => void;
  handleCancelDownload: (modelKey: string) => void;
  onOpenGeneralTab: () => void;
  onOpenProvidersTab: () => void;
};

const ModelsTab = ({ variants, ...models }: ModelsTabProps) => {
  const [browsing, setBrowsing] = useState(false);
  return (
    <motion.div
      key="models"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex h-full flex-col"
    >
      {browsing ? (
        <ModelBrowser
          catalog={models.modelCatalog}
          status={models.modelStatus}
          progress={models.downloadState}
          activeKey={models.localModel}
          onBack={() => setBrowsing(false)}
          onUse={models.setLocalModel}
          onDownload={models.handleDownload}
          onDelete={models.handleDelete}
          onCancel={models.handleCancelDownload}
        />
      ) : (
        <ModelsOverview
          catalog={models.modelCatalog}
          status={models.modelStatus}
          progress={models.downloadState}
          localModel={models.localModel}
          transcriptionMode={models.transcriptionMode}
          remoteSpeechEnabled={models.remoteSpeechEnabled}
          remoteSpeechProvider={models.remoteSpeechProvider}
          remoteSpeechModel={models.remoteSpeechModel}
          onUse={models.setLocalModel}
          onDownload={models.handleDownload}
          onDelete={models.handleDelete}
          onCancel={models.handleCancelDownload}
          onBrowse={() => setBrowsing(true)}
          onOpenGeneral={models.onOpenGeneralTab}
          onOpenProviders={models.onOpenProvidersTab}
        />
      )}
    </motion.div>
  );
};

export default ModelsTab;
