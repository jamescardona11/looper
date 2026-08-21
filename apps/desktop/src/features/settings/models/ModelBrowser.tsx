import { useLingui } from "@lingui/react/macro";
import { CaretLeft as ChevronLeft } from "@phosphor-icons/react";
import { ModelPickerPanel } from "../../../shared/ui/ModelPickerModal";
import type {
  DownloadEvent,
  ModelInfo,
  ModelStatus,
} from "../../../contracts/index";

export function ModelBrowser({
  catalog,
  status,
  progress,
  activeKey,
  onBack,
  onUse,
  onDownload,
  onDelete,
  onCancel,
}: {
  catalog: ModelInfo[];
  status: Record<string, ModelStatus>;
  progress: Record<string, DownloadEvent>;
  activeKey: string;
  onBack: () => void;
  onUse: (key: string) => void;
  onDownload: (key: string, ane?: boolean) => void;
  onDelete: (key: string) => void;
  onCancel: (key: string) => void;
}) {
  const { t } = useLingui();
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 self-start ui-text-body-sm ui-color-muted transition-colors hover:ui-color-primary"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {t({ id: "settings.models.back", message: "Back" })}
      </button>
      <ModelPickerPanel
        className="w-full min-h-0 flex-1"
        fadeColor="var(--color-bg-overlay)"
        catalog={catalog}
        activeKey={activeKey}
        isInstalled={(key) => Boolean(status[key]?.installed)}
        isAneInstalled={(key) => Boolean(status[key]?.ane_installed)}
        progressFor={(key) => progress[key]}
        onUse={onUse}
        onDownload={onDownload}
        onDelete={onDelete}
        onCancel={onCancel}
      />
    </>
  );
}
