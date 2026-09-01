import { LibraryTranscriptContent } from "./library-transcript-content";
import { LibraryTranscriptError } from "./library-transcript-error";
import type { LibraryTranscriptPanelProps } from "./library-transcript-panel-types";

export function LibraryTranscriptPanel(props: LibraryTranscriptPanelProps) {
  const documentMode = Boolean(props.documentMode);
  const error =
    props.item.status.type === "error" ? props.item.status.message : null;

  return (
    <main
      data-testid={documentMode ? "meeting-transcript-document" : undefined}
      className={`h-full min-h-0 min-w-0 flex-1 overflow-hidden ${documentMode ? "px-0" : "px-4"}`}
    >
      {error ? (
        <LibraryTranscriptError message={error} />
      ) : (
        <LibraryTranscriptContent {...props} />
      )}
    </main>
  );
}
