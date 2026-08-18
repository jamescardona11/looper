import { useLingui } from "@lingui/react/macro";
import { CircleNotch } from "@phosphor-icons/react";

type YoutubeImportActionsProps = {
  isImporting: boolean;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const YoutubeImportActions = ({
  isImporting,
  canConfirm,
  onCancel,
  onConfirm,
}: YoutubeImportActionsProps) => {
  const { t } = useLingui();
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border-primary px-5 py-3">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-2 ui-text-body-sm text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
      >
        {t({ id: "common.cancel", message: "Cancel" })}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!canConfirm}
        className="inline-flex items-center gap-1.5 rounded-lg bg-content-primary px-3 py-2 ui-text-body-sm text-surface-primary transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {isImporting && <CircleNotch size={13} className="animate-spin" />}
        {t({
          id: "library.youtube.import",
          message: "Download and transcribe",
        })}
      </button>
    </div>
  );
};
