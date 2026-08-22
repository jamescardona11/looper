import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Warning as AlertTriangle } from "@phosphor-icons/react";
import { motion } from "framer-motion";

type DeleteLibraryItemDialogProps = {
  onClose: () => void;
  onDelete: () => void;
};

const DELETE_COPY = {
  title: msg({
    id: "library.modal.delete_confirm.title",
    message: "Delete this item?",
  }),
  description: msg({
    id: "library.modal.delete_confirm.description",
    message: "This removes the transcript and audio from your library.",
  }),
  cancel: msg({ id: "library.modal.cancel", message: "Cancel" }),
  confirm: msg({ id: "library.modal.delete", message: "Delete" }),
};

const OVERLAY_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const PANEL_MOTION = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.96, opacity: 0 },
  transition: { duration: 0.18 },
};

const OVERLAY_CLASS = [
  "fixed inset-0 z-[100]",
  "flex items-center justify-center",
  "bg-black/70 backdrop-blur-xs px-6",
].join(" ");

const PANEL_CLASS = [
  "w-full max-w-sm rounded-2xl",
  "border border-border-primary bg-surface-tertiary",
  "p-5 ui-shadow-modal-deep",
].join(" ");

export function DeleteLibraryItemDialog({
  onClose,
  onDelete,
}: DeleteLibraryItemDialogProps) {
  const { i18n } = useLingui();

  const confirmDelete = () => {
    onClose();
    onDelete();
  };

  return (
    <motion.div
      {...OVERLAY_MOTION}
      className={OVERLAY_CLASS}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        {...PANEL_MOTION}
        className={PANEL_CLASS}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <DeleteDialogPrompt
          title={i18n._(DELETE_COPY.title)}
          description={i18n._(DELETE_COPY.description)}
        />
        <div className="flex justify-end gap-2">
          <DeleteDialogAction
            onClick={onClose}
            label={i18n._(DELETE_COPY.cancel)}
            destructive={false}
          />
          <DeleteDialogAction
            onClick={confirmDelete}
            label={i18n._(DELETE_COPY.confirm)}
            destructive
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function DeleteDialogPrompt({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <AlertTriangle size={20} className="ui-color-warning-strong shrink-0" />
      <div>
        <p className="ui-text-body-lg font-semibold text-content-primary">
          {title}
        </p>
        <p className="ui-text-label text-content-disabled">{description}</p>
      </div>
    </div>
  );
}

function DeleteDialogAction({
  label,
  destructive,
  onClick,
}: {
  label: string;
  destructive: boolean;
  onClick: () => void;
}) {
  const className = destructive
    ? "rounded-lg bg-red-500/90 px-4 py-2 ui-text-body-sm font-semibold ui-color-on-solid hover:bg-red-500 transition-colors"
    : "rounded-lg border border-border-secondary px-4 py-2 ui-text-body-sm font-medium text-content-secondary hover:border-border-hover transition-colors";

  return (
    <button onClick={onClick} className={className}>
      {label}
    </button>
  );
}
