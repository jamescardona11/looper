import { useLingui } from "@lingui/react/macro";

import { LibraryTranscriptSegments } from "./library-transcript-segments";
import { LibraryTranscriptStream } from "./library-transcript-stream";
import { TranscriptProgress } from "./library-transcript-progress";
import type { LibraryTranscriptPanelProps } from "./library-transcript-panel-types";

export function LibraryTranscriptContent(props: LibraryTranscriptPanelProps) {
  const { t } = useLingui();
  const documentMode = Boolean(props.documentMode);
  const waitingForImport = ["recording", "importing", "pending"].includes(
    props.item.status.type,
  );

  let transcriptContent;
  if (props.showSegmentView) {
    transcriptContent = <LibraryTranscriptSegments {...props} />;
  } else if (props.showStreaming) {
    transcriptContent = (
      <LibraryTranscriptStream
        {...props}
        transcribingLabel={t({
          id: "library.modal.transcribing",
          message: "Transcribing...",
        })}
      />
    );
  } else if (waitingForImport) {
    transcriptContent = <TranscriptProgress label={props.importStatusText} />;
  } else {
    transcriptContent = (
      <textarea
        ref={props.transcriptAreaRef}
        value={props.transcriptDraft}
        onChange={(event) => props.setTranscriptDraft(event.target.value)}
        disabled={!props.transcriptAvailable}
        placeholder={t({
          id: "library.modal.transcript_placeholder",
          message: "Transcript will appear here.",
        })}
        className="h-full w-full resize-none bg-transparent ui-text-body text-content-secondary leading-relaxed outline-hidden disabled:opacity-60 custom-scrollbar select-text pr-4 pt-2 pb-4"
      />
    );
  }

  const content = documentMode ? (
    <section className="flex h-full min-h-0 flex-col pt-1">
      <header className="flex shrink-0 items-end justify-between gap-4 border-b border-border-primary pb-3">
        <div>
          <p className="ui-text-uppercase-micro text-content-muted">
            {t({ id: "meeting.detail.transcript", message: "Transcript" })}
          </p>
          <h2 className="mt-1 ui-text-title text-content-primary">
            {t({
              id: "meeting.detail.original_local_transcript",
              message: "Original local transcript",
            })}
          </h2>
        </div>
        {props.onCopy ? (
          <button
            type="button"
            onClick={props.onCopy}
            disabled={!props.transcriptAvailable}
            className="h-9 rounded-[10px] px-3 ui-text-body-sm-strong text-content-secondary transition-colors hover:bg-surface-secondary hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {props.copyConfirmed
              ? t({ id: "library.modal.copy.copied", message: "Copied" })
              : t({ id: "library.modal.copy", message: "Copy" })}
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">{transcriptContent}</div>
    </section>
  ) : (
    transcriptContent
  );

  return (
    <div
      className={`relative mx-auto h-full w-full ${documentMode ? "max-w-none" : "max-w-3xl"}`}
    >
      {!documentMode ? (
        <div
          className="pointer-events-none absolute left-0 right-3 bottom-0 h-6 z-10"
          style={{
            background:
              "linear-gradient(to top, var(--color-bg-tertiary), transparent)",
          }}
          aria-hidden="true"
          data-testid="library-transcript-scroll-fade"
        />
      ) : null}
      {content}
    </div>
  );
}
