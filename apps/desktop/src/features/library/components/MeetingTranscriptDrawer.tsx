import { useLingui } from "@lingui/react/macro";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type MeetingTranscriptDrawerProps = {
  open: boolean;
  searchQuery: string;
  searchMatchLabel: string | null;
  onSearchChange: (value: string) => void;
  canShowTimestamps: boolean;
  speakerView: boolean;
  onViewToggle: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function MeetingTranscriptDrawer({
  open,
  searchQuery,
  searchMatchLabel,
  onSearchChange,
  canShowTimestamps,
  speakerView,
  onViewToggle,
  onClose,
  children,
}: MeetingTranscriptDrawerProps) {
  const { t } = useLingui();

  return (
    <aside
      data-ui-panel="meeting-transcript"
      aria-label={t({
        id: "meeting.detail.verify_source",
        message: "Verify source transcript",
      })}
      aria-hidden={!open}
      className={`shrink-0 overflow-hidden border-l bg-surface-primary/70 transition-[width,opacity,border-color] duration-200 ease-out motion-reduce:transition-none ${
        open
          ? "w-[340px] border-border-primary opacity-100"
          : "pointer-events-none w-0 border-transparent opacity-0"
      }`}
    >
      <div className="flex h-full w-[340px] flex-col">
        <header className="shrink-0 px-4 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div>
              <h2 className="ui-text-body-sm-strong text-content-primary">
                {t({
                  id: "meeting.detail.verify_source_title",
                  message: "Verify source",
                })}
              </h2>
              <p className="mt-1 ui-text-micro leading-relaxed text-content-muted">
                {t({
                  id: "meeting.detail.verify_source_help",
                  message:
                    "Search the transcript or follow the recording without leaving the document.",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary"
              aria-label={t({
                id: "meeting.detail.close_transcript",
                message: "Close transcript",
              })}
            >
              <X size={14} />
            </button>
          </div>

          <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-border-primary bg-surface-secondary px-2.5 focus-within:border-border-hover">
            <MagnifyingGlass
              size={13}
              className="shrink-0 text-content-disabled"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t({
                id: "library.modal.search.placeholder",
                message: "Search transcript...",
              })}
              className="min-w-0 flex-1 bg-transparent ui-text-label text-content-secondary outline-none placeholder:text-content-disabled"
            />
            {searchMatchLabel ? (
              <span className="ui-text-micro tabular-nums text-content-disabled">
                {searchMatchLabel}
              </span>
            ) : null}
          </label>

          <div className="mt-2 flex items-center justify-between">
            <span className="ui-text-micro text-content-disabled">
              {t({
                id: "meeting.detail.transcript",
                message: "Transcript",
              })}
            </span>
            <button
              type="button"
              disabled={!canShowTimestamps}
              onClick={onViewToggle}
              className="rounded-md px-2 py-1 ui-text-micro text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary disabled:opacity-40"
            >
              {speakerView
                ? t({ id: "meeting.detail.raw_text", message: "Raw text" })
                : t({
                    id: "meeting.detail.speaker_view",
                    message: "Speaker view",
                  })}
            </button>
          </div>
        </header>
        <div
          data-ui-region="meeting-transcript-content"
          className="flex min-h-0 flex-1"
        >
          {children}
        </div>
      </div>
    </aside>
  );
}
