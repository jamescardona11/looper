import { useLingui } from "@lingui/react/macro";
import {
  ArrowClockwise,
  CaretDown,
  Check,
  Copy,
  DotsThreeVertical,
  Record,
  Trash,
  Translate,
} from "@phosphor-icons/react";

import { isCaptureItem } from "./library-detail-policy";
import { HeaderMenuSurface } from "./library-detail-header-menu";
import type { LibraryDetailHeaderProps } from "./library-detail-header-types";
import type { ExportFormat } from "../../../contracts";

type ActionsProps = Pick<
  LibraryDetailHeaderProps,
  | "copyConfirmed"
  | "exportMenuRef"
  | "exportOpen"
  | "handleCopy"
  | "handleExport"
  | "isBusy"
  | "isExporting"
  | "item"
  | "onCancel"
  | "onContinueRecording"
  | "onRetry"
  | "overflowOpen"
  | "overflowMenuRef"
  | "setExportOpen"
  | "setOverflowOpen"
  | "setShowDeleteConfirm"
  | "setShowRetranscribe"
  | "setShowTranslations"
  | "transcriptAvailable"
>;

const EXPORT_FORMATS: ExportFormat[] = ["txt", "md", "srt", "vtt"];
const EXPORT_MENU =
  "absolute right-0 top-full mt-1 w-36 rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-bg-overlay)] shadow-xl overflow-hidden z-[120]";
const MORE_MENU =
  "absolute right-0 top-full mt-1 w-44 rounded-lg border border-[var(--color-border-secondary)] bg-[var(--color-bg-overlay)] shadow-xl overflow-hidden z-[120]";
const MENU_ACTION =
  "w-full flex items-center gap-2 px-3 py-1.5 text-left ui-text-meta text-content-secondary hover:bg-surface-overlay hover:text-content-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
const MENU_ACTION_ENABLED =
  "w-full flex items-center gap-2 px-3 py-1.5 text-left ui-text-meta text-content-secondary hover:bg-surface-overlay hover:text-content-primary transition-colors";
const DELETE_ACTION =
  "w-full flex items-center gap-2 px-3 py-1.5 text-left ui-text-meta ui-color-error-soft hover:bg-[var(--color-error)]/10 transition-colors border-t border-border-primary";

export function LibraryDetailActions(props: ActionsProps) {
  return (
    <div className="col-start-3 row-start-1 flex items-center justify-end gap-1">
      <CopyAction {...props} />
      <ExportAction {...props} />
      <OverflowAction {...props} />
    </div>
  );
}

function CopyAction(props: ActionsProps) {
  const { t } = useLingui();
  const feedback = props.copyConfirmed
    ? t({ id: "library.modal.copy.copied", message: "Copied" })
    : t({ id: "library.modal.copy", message: "Copy" });
  return (
    <button
      onClick={props.handleCopy}
      disabled={!props.transcriptAvailable}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ui-text-meta disabled:opacity-50 transition-colors ${
        props.copyConfirmed
          ? "ui-color-success bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]"
          : "text-content-secondary hover:text-content-primary hover:bg-surface-surface"
      }`}
    >
      {props.copyConfirmed ? <Check size={10} /> : <Copy size={10} />}
      <span className="inline-block min-w-[38px] text-left">{feedback}</span>
    </button>
  );
}

function ExportAction(props: ActionsProps) {
  const { t } = useLingui();
  return (
    <div className="relative" ref={props.exportMenuRef}>
      <button
        onClick={() => props.setExportOpen(!props.exportOpen)}
        disabled={props.isExporting || !props.transcriptAvailable}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 ui-text-meta text-content-secondary hover:text-content-primary hover:bg-surface-surface disabled:opacity-50"
      >
        {t({ id: "library.modal.export", message: "Export" })}
        <CaretDown size={10} />
      </button>
      <HeaderMenuSurface
        open={props.exportOpen}
        className={EXPORT_MENU}
        motionStyle="drop"
      >
        {EXPORT_FORMATS.map((format) => (
          <button
            key={format}
            onClick={() => props.handleExport(format)}
            disabled={
              (format === "srt" || format === "vtt") &&
              !props.item.segments?.length
            }
            className="w-full px-3 py-1.5 text-left ui-text-meta text-content-secondary hover:bg-surface-overlay disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {format.toUpperCase()}
          </button>
        ))}
      </HeaderMenuSurface>
    </div>
  );
}

function OverflowAction(props: ActionsProps) {
  const { t } = useLingui();
  const open = (target: "translation" | "retranscription" | "delete") => {
    props.setOverflowOpen(false);
    if (target === "translation") props.setShowTranslations(true);
    if (target === "retranscription") props.setShowRetranscribe(true);
    if (target === "delete") props.setShowDeleteConfirm(true);
  };
  const cancel = () => {
    props.setOverflowOpen(false);
    props.onCancel();
  };
  const retry = () => {
    props.setOverflowOpen(false);
    void Promise.resolve(props.onRetry()).catch((error) => {
      console.error("failed to retry:", error);
    });
  };

  return (
    <div className="relative" ref={props.overflowMenuRef}>
      <button
        onClick={() => props.setOverflowOpen((open) => !open)}
        className="flex items-center justify-center rounded-md p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-surface transition-colors"
        aria-label={t({
          id: "library.detail.more_actions",
          message: "More actions",
        })}
      >
        <DotsThreeVertical size={14} weight="bold" />
      </button>
      <HeaderMenuSurface
        open={props.overflowOpen}
        className={MORE_MENU}
        motionStyle="drop"
      >
        <button
          onClick={() => open("translation")}
          disabled={!props.transcriptAvailable}
          className={MENU_ACTION}
        >
          <Translate size={11} />
          {t({ id: "library.translation.action", message: "Translate" })}
        </button>
        <button
          onClick={() => open("retranscription")}
          disabled={props.isBusy}
          className={MENU_ACTION}
        >
          <ArrowClockwise size={11} />
          {t({ id: "library.modal.retranscribe", message: "Retranscribe" })}
        </button>
        {/* Solo sobre una captura ya terminada: continuar sobre algo que aún se
            transcribe dejaría el texto a medias contra un audio que creció. */}
        {isCaptureItem(props.item) && !props.isBusy ? (
          <button onClick={props.onContinueRecording} className={MENU_ACTION}>
            <Record size={11} />
            {t({
              id: "library.detail.continue_recording",
              message: "Continue recording",
            })}
          </button>
        ) : null}
        {props.isBusy ? (
          <button
            onClick={cancel}
            className="w-full px-3 py-1.5 text-left ui-text-meta text-content-secondary hover:bg-surface-overlay hover:text-content-primary transition-colors"
          >
            {t({ id: "library.modal.cancel", message: "Cancel" })}
          </button>
        ) : null}
        {props.item.status.type === "error" ? (
          <button onClick={retry} className={MENU_ACTION_ENABLED}>
            <ArrowClockwise size={11} />
            {t({ id: "library.modal.retry", message: "Retry" })}
          </button>
        ) : null}
        <button onClick={() => open("delete")} className={DELETE_ACTION}>
          <Trash size={11} />
          {t({ id: "library.modal.delete", message: "Delete" })}
        </button>
      </HeaderMenuSurface>
    </div>
  );
}
