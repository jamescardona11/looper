import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Warning as AlertTriangle } from "@phosphor-icons/react";
import type { AppTabControls } from "./useAppTabControls";

export function AppConfirmationDialogs({
  controls,
}: {
  controls: AppTabControls;
}) {
  const { t } = useLingui();
  const budget = controls.pendingBudgetConfirmation;
  const budgetMessage = budget
    ? budget.candidateCount === null
      ? t({
          id: "settings.app.audio_budget.confirm.unknown",
          message:
            "Looper couldn't calculate the impact. Applying this limit may remove older saved audio immediately.",
        })
      : t({
          id: "settings.app.audio_budget.confirm.known",
          message: `Applying this limit will remove ${budget.candidateCount} older audio files (${Math.max(1, Math.ceil((budget.candidateBytes ?? 0) / (1024 * 1024)))} MB) immediately.`,
        })
    : "";

  return (
    <>
      <AnimatePresence>
        {controls.pendingPruneConfirmation && (
          <ConfirmationDialog
            title={t({
              id: "settings.app.auto_delete.confirm.title",
              message: "Delete older items now?",
            })}
            message={controls.pruneConfirmationMessage}
            footnote={controls.pruneConfirmationFootnote}
            confirmLabel={t({
              id: "settings.app.auto_delete.confirm.apply",
              message: "Apply anyway",
            })}
            onCancel={controls.handleClosePruneConfirmation}
            onConfirm={controls.handleConfirmPruneChange}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {budget && (
          <ConfirmationDialog
            title={t({
              id: "settings.app.audio_budget.confirm.title",
              message: "Remove older audio now?",
            })}
            message={budgetMessage}
            footnote={t({
              id: "settings.app.audio_budget.confirm.footnote",
              message:
                "Transcripts are kept. Active and unfinished recordings are never considered.",
            })}
            confirmLabel={t({
              id: "settings.app.audio_budget.confirm.apply",
              message: "Apply limit",
            })}
            onCancel={controls.handleCloseBudgetConfirmation}
            onConfirm={controls.handleConfirmBudgetChange}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ConfirmationDialog({
  title,
  message,
  footnote,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: ReactNode;
  footnote: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLingui();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6 backdrop-blur-xs"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-surface-tertiary p-5 ui-shadow-modal-deep"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-start gap-3">
          <AlertTriangle
            size={20}
            className="mt-1 shrink-0 text-red-400"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="ui-text-body-lg ui-color-error-strong font-semibold leading-tight">
              {title}
            </p>
            <p className="mt-1 ui-text-body text-content-primary leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <p className="ui-text-micro text-content-muted">{footnote}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-secondary px-4 py-2 ui-text-body-sm text-content-secondary font-medium transition-colors hover:border-border-hover"
          >
            {t({ id: "settings.app.cancel", message: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-500/90 px-4 py-2 ui-text-body-sm ui-color-on-solid font-semibold transition-colors hover:bg-red-500"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
