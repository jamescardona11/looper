import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

const CANCEL_CLASS = [
  "rounded-lg px-3 py-2 ui-text-body-sm font-medium",
  "text-content-muted transition-colors hover:text-content-primary",
].join(" ");
const CONFIRM_CLASS = [
  "rounded-lg bg-amber-400 px-4 py-2 ui-text-body-sm font-semibold",
  "ui-color-on-warning transition-colors hover:bg-amber-300",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");
const ACTION_COPY = {
  cancel: msg({ id: "library.retranscribe.cancel", message: "Cancel" }),
  pending: msg({
    id: "library.retranscribe.loading",
    message: "Retranscribing...",
  }),
  confirm: msg({ id: "library.retranscribe.confirm", message: "Retranscribe" }),
};

export function LibraryRetranscribeActions({
  canConfirm,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  canConfirm: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { i18n } = useLingui();
  const confirmLabel = isSubmitting
    ? i18n._(ACTION_COPY.pending)
    : i18n._(ACTION_COPY.confirm);

  return (
    <div className="flex items-center justify-end gap-2 px-5 pb-4">
      <button onClick={onCancel} className={CANCEL_CLASS}>
        {i18n._(ACTION_COPY.cancel)}
      </button>
      <button
        onClick={onConfirm}
        disabled={isSubmitting || !canConfirm}
        className={CONFIRM_CLASS}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
