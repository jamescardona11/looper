import { AnimatePresence, motion } from "framer-motion";
import { useLingui } from "@lingui/react/macro";
import type { PendingDeletePersonality } from "./PersonalityModal";

const backdropClass =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs";
const panelClass =
  "w-[380px] max-w-[92vw] rounded-2xl border border-border-secondary bg-surface-overlay p-5 shadow-2xl";
const cancelClass =
  "rounded-lg border border-border-primary bg-surface-surface px-3 py-1.5 ui-text-button ui-color-primary hover:bg-surface-elevated transition-colors";
const confirmClass =
  "rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 ui-text-button font-semibold ui-color-error-soft hover:bg-red-500/15 transition-colors";
const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
const panelMotion = {
  initial: { opacity: 0, scale: 0.96, y: 14 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 14 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;

export function PersonalizationDeleteDialog({
  pendingDelete,
  cancel,
  confirm,
}: {
  pendingDelete: PendingDeletePersonality | null;
  cancel: () => void;
  confirm: () => void;
}) {
  const { t } = useLingui();
  const title = t({
    message: "Delete mode?",
    id: "personalization.delete_mode.title",
  });
  const description = pendingDelete
    ? t({
        message: `Delete "${pendingDelete.name}"? This cannot be undone.`,
        id: "personalization.delete_mode.description",
      })
    : "";

  return (
    <AnimatePresence>
      {pendingDelete ? (
        <motion.div
          className={backdropClass}
          {...backdropMotion}
          onClick={cancel}
        >
          <motion.div
            className={panelClass}
            {...panelMotion}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-mode-title"
          >
            <h3
              className="ui-text-title-strong ui-color-primary"
              id="delete-mode-title"
            >
              {title}
            </h3>
            <p className="mt-2 ui-text-body-sm ui-color-secondary">
              {description}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className={cancelClass} onClick={cancel} type="button">
                {t({ id: "personalization.cancel", message: "Cancel" })}
              </button>
              <button className={confirmClass} onClick={confirm} type="button">
                {t({ id: "personalization.delete", message: "Delete" })}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
