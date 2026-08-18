import { DownloadSimple } from "@phosphor-icons/react";
import { PRIMARY_BUTTON_CLASS } from "./shared";

type IntelligenceStepActionsProps = {
  downloading: boolean;
  onDownload: () => void;
  onNotNow: () => void;
};

export function IntelligenceStepActions({
  downloading,
  onDownload,
  onNotNow,
}: IntelligenceStepActionsProps) {
  return (
    <>
      <button
        type="button"
        className={PRIMARY_BUTTON_CLASS}
        onClick={onDownload}
      >
        <DownloadSimple size={16} />
        {downloading ? "Continue" : "Download"}
      </button>
      <button
        type="button"
        className="px-4 py-2 ui-text-body-sm-strong text-content-muted transition-colors hover:text-content-primary"
        onClick={onNotNow}
      >
        Not now
      </button>
    </>
  );
}
