import { useLingui } from "@lingui/react/macro";
import { Plus } from "@phosphor-icons/react";

type FileImportActionsProps = {
  isImporting: boolean;
  canConfirm: boolean;
  onAddFiles: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const actionBarClass = [
  "flex items-center justify-between gap-2",
  "px-5 pb-4",
].join(" ");
const addButtonClass = [
  "flex items-center gap-1.5 rounded-lg px-2 py-2",
  "ui-text-body-sm font-medium text-content-muted transition-colors",
  "hover:text-content-primary",
].join(" ");
const cancelButtonClass = [
  "rounded-lg px-3 py-2 ui-text-body-sm font-medium",
  "text-content-muted transition-colors hover:text-content-primary",
].join(" ");
const confirmButtonClass = [
  "rounded-lg bg-amber-400 px-4 py-2 ui-text-body-sm font-semibold",
  "ui-color-on-warning transition-colors hover:bg-amber-300",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export const FileImportActions = ({
  isImporting,
  canConfirm,
  onAddFiles,
  onCancel,
  onConfirm,
}: FileImportActionsProps) => {
  const { t } = useLingui();
  return (
    <div className={actionBarClass}>
      <button onClick={onAddFiles} className={addButtonClass}>
        <Plus size={12} aria-hidden="true" />
        {t({ id: "library.import.add_files", message: "Add files" })}
      </button>
      <div className={["flex", "items-center", "gap-2"].join(" ")}>
        <button onClick={onCancel} className={cancelButtonClass}>
          {t({ id: "library.import.cancel", message: "Cancel" })}
        </button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className={confirmButtonClass}
        >
          {isImporting
            ? t({ id: "library.import.importing", message: "Starting..." })
            : t({ id: "library.import.confirm", message: "Transcribe" })}
        </button>
      </div>
    </div>
  );
};
