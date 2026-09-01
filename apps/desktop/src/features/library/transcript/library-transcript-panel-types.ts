import type { VirtuosoHandle } from "react-virtuoso";
import type { MutableRefObject, ReactNode, RefObject } from "react";

import type { LibraryItem, TranscriptSegment } from "../../../contracts";

export type VisibleTranscriptSegment = {
  segment: TranscriptSegment;
  index: number;
};

export type LibraryTranscriptPanelProps = {
  documentMode?: boolean;
  item: LibraryItem;
  showSegmentView: boolean;
  visibleSegments: VisibleTranscriptSegment[];
  segmentsVirtuosoRef: RefObject<VirtuosoHandle | null>;
  segmentsScrollerRef: MutableRefObject<HTMLElement | null>;
  activeSegmentIndex: number;
  normalizedSearchQuery: string;
  renderSegmentWords: (segment: TranscriptSegment, index: number) => ReactNode;
  renderHighlightedText: (text: string, active: boolean) => ReactNode;
  activeSegmentMatch: number;
  renderSpeakerChip: (segment: TranscriptSegment, index: number) => ReactNode;
  handleTimestampClick: (startMs: number) => void;
  showStreaming: boolean;
  streamChunks: string[];
  streamVirtuosoRef: RefObject<VirtuosoHandle | null>;
  activeStreamMatch: number;
  importStatusText: string;
  transcriptAreaRef: RefObject<HTMLTextAreaElement | null>;
  transcriptDraft: string;
  setTranscriptDraft: (value: string) => void;
  transcriptAvailable: boolean;
  copyConfirmed?: boolean;
  onCopy?: () => void;
};
