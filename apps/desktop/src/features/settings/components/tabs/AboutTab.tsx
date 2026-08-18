import { motion, type Variants } from "framer-motion";
import type {
  AppInfo,
  CliInstallStatus,
  TranscriptionMode,
} from "../../../../types";
import { resetOnboarding, revealLogs } from "../../../../data/settings";
import { AboutOverview } from "./AboutOverview";
import { AboutStorage } from "./AboutStorage";
import { AboutSetup } from "./AboutSetup";
import { AboutCli } from "./AboutCli";
import { storageMetrics } from "./about-tab-model";

type AboutTabProps = {
  variants: Variants;
  appInfo: AppInfo | null;
  transcriptionMode: TranscriptionMode;
  formatBytes: (bytes: number) => string;
  cliInstallStatus: CliInstallStatus | null;
  cliInstallBusy: boolean;
  activeLicense: boolean;
  onInstallCli: () => void;
  onRemoveCli: () => void;
  onOpenDataDir: () => void;
  onExportArchive: () => void;
  archiveExportStatus: "idle" | "exporting" | "complete";
  onOpenFAQ: () => void;
};

const AboutTab = ({
  variants,
  appInfo,
  transcriptionMode,
  formatBytes,
  cliInstallStatus,
  cliInstallBusy,
  activeLicense,
  onInstallCli,
  onRemoveCli,
  onOpenDataDir,
  onExportArchive,
  archiveExportStatus,
  onOpenFAQ,
}: AboutTabProps) => {
  const restartOnboarding = async () => {
    try {
      await resetOnboarding();
      window.location.reload();
    } catch (error) {
      console.error("Failed to restart onboarding:", error);
    }
  };

  return (
    <motion.div
      key="about"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-5"
    >
      <AboutOverview
        version={appInfo?.version ?? null}
        transcriptionMode={transcriptionMode}
        onShowLogs={() => void revealLogs().catch(() => {})}
      />
      <AboutStorage
        metrics={storageMetrics(appInfo)}
        dataPath={appInfo?.data_dir_path ?? null}
        formatBytes={formatBytes}
        exportStatus={archiveExportStatus}
        onOpenDataDir={onOpenDataDir}
        onExportArchive={onExportArchive}
      />
      <AboutSetup
        onRestartOnboarding={() => void restartOnboarding()}
        onOpenFAQ={onOpenFAQ}
      />
      <AboutCli
        status={cliInstallStatus}
        busy={cliInstallBusy}
        activeAccess={activeLicense}
        onInstall={onInstallCli}
        onRemove={onRemoveCli}
      />
    </motion.div>
  );
};

export default AboutTab;
