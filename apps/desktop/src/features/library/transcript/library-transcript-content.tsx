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

  let content;
  if (props.showSegmentView) {
    content = <LibraryTranscriptSegments {...props} />;
  } else if (props.showStreaming) {
    content = (
      <LibraryTranscriptStream
        {...props}
        transcribingLabel={t({
          id: "library.modal.transcribing",
          message: "Transcribing...",
        })}
      />
    );
  } else if (waitingForImport) {
    content = <TranscriptProgress label={props.importStatusText} />;
  } else {
    content = (
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

  return (
    <div
      className={`relative mx-auto h-full w-full ${documentMode ? "max-w-none" : "max-w-3xl"}`}
    >
      <div
        className="pointer-events-none absolute left-0 right-3 bottom-0 h-6 z-10"
        style={{
          background:
            "linear-gradient(to top, var(--color-bg-tertiary), transparent)",
        }}
        aria-hidden="true"
      />
      {content}
    </div>
  );
}
