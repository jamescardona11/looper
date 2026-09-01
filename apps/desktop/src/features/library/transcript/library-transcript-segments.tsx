import { Virtuoso } from "react-virtuoso";
import type { KeyboardEvent } from "react";

import { formatTimestamp } from "../shared/library-utils";
import type {
  LibraryTranscriptPanelProps,
  VisibleTranscriptSegment,
} from "./library-transcript-panel-types";

type LibraryTranscriptSegmentsProps = Pick<
  LibraryTranscriptPanelProps,
  | "documentMode"
  | "visibleSegments"
  | "segmentsVirtuosoRef"
  | "segmentsScrollerRef"
  | "activeSegmentIndex"
  | "normalizedSearchQuery"
  | "renderSegmentWords"
  | "renderHighlightedText"
  | "activeSegmentMatch"
  | "renderSpeakerChip"
  | "handleTimestampClick"
>;

export function LibraryTranscriptSegments({
  documentMode = false,
  visibleSegments,
  segmentsVirtuosoRef,
  segmentsScrollerRef,
  activeSegmentIndex,
  normalizedSearchQuery,
  renderSegmentWords,
  renderHighlightedText,
  activeSegmentMatch,
  renderSpeakerChip,
  handleTimestampClick,
}: LibraryTranscriptSegmentsProps) {
  const listClass = documentMode
    ? "custom-scrollbar text-content-secondary ui-text-body-sm leading-relaxed"
    : "custom-scrollbar text-content-secondary ui-text-body-lg leading-relaxed";

  return (
    <Virtuoso
      ref={segmentsVirtuosoRef}
      scrollerRef={(element) => {
        segmentsScrollerRef.current = (element as HTMLElement) ?? null;
      }}
      style={{ height: "100%" }}
      data={visibleSegments}
      overscan={200}
      className={listClass}
      computeItemKey={(_index, entry) =>
        `${entry.segment.start_ms}-${entry.index}`
      }
      components={{
        Header: () => <div className={documentMode ? "h-5" : "h-4"} />,
        Footer: () => <div className={documentMode ? "h-8" : "h-4"} />,
      }}
      itemContent={(position, entry) => (
        <TranscriptSegmentRow
          documentMode={documentMode}
          position={position}
          entry={entry}
          activeSegmentIndex={activeSegmentIndex}
          normalizedSearchQuery={normalizedSearchQuery}
          renderSegmentWords={renderSegmentWords}
          renderHighlightedText={renderHighlightedText}
          activeSegmentMatch={activeSegmentMatch}
          renderSpeakerChip={renderSpeakerChip}
          handleTimestampClick={handleTimestampClick}
        />
      )}
    />
  );
}

function TranscriptSegmentRow({
  documentMode,
  position,
  entry,
  activeSegmentIndex,
  normalizedSearchQuery,
  renderSegmentWords,
  renderHighlightedText,
  activeSegmentMatch,
  renderSpeakerChip,
  handleTimestampClick,
}: {
  documentMode: boolean;
  position: number;
  entry: VisibleTranscriptSegment;
  activeSegmentIndex: number;
  normalizedSearchQuery: string;
  renderSegmentWords: LibraryTranscriptPanelProps["renderSegmentWords"];
  renderHighlightedText: LibraryTranscriptPanelProps["renderHighlightedText"];
  activeSegmentMatch: number;
  renderSpeakerChip: LibraryTranscriptPanelProps["renderSpeakerChip"];
  handleTimestampClick: LibraryTranscriptPanelProps["handleTimestampClick"];
}) {
  const { segment } = entry;
  const active = entry.index === activeSegmentIndex;
  const words =
    active && !normalizedSearchQuery
      ? renderSegmentWords(segment, entry.index)
      : null;
  const activateTimestamp = () => handleTimestampClick(segment.start_ms);
  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTimestamp();
  };
  const gridClass = documentMode
    ? "grid-cols-[56px_minmax(0,1fr)] gap-3 border-b border-border-primary px-0 py-3"
    : "grid-cols-[72px_minmax(0,1fr)] gap-4 rounded-xl px-4 py-3";

  return (
    <div className={documentMode ? "pr-2" : "pb-2 pr-4"}>
      <div
        data-testid={documentMode ? "conversation-turn" : undefined}
        className={`group/seg grid w-full select-none transcript-segment ${gridClass}${active ? " transcript-segment-active" : ""}`}
      >
        <button
          type="button"
          className={`transcript-segment-time self-start text-left font-mono ui-text-body-sm tabular-nums select-none cursor-pointer transition-colors ${
            documentMode
              ? "font-semibold text-[var(--color-toggle-on)] hover:brightness-90"
              : "text-content-disabled hover:text-content-primary"
          }`}
          onClick={activateTimestamp}
          onKeyDown={activateFromKeyboard}
        >
          {formatTimestamp(segment.start_ms)}
        </button>
        <div className="min-w-0 select-none leading-relaxed">
          <div className="mr-2 inline-flex align-baseline font-semibold">
            {renderSpeakerChip(segment, entry.index)}
          </div>
          <span className="select-text">
            {words ??
              renderHighlightedText(
                segment.text,
                position === activeSegmentMatch,
              )}
          </span>
        </div>
      </div>
    </div>
  );
}
