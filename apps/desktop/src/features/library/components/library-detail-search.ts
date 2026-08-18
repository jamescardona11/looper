import type { Dispatch, SetStateAction } from "react";

import {
  indexedMatchLabel,
  matchingIndexes,
  nextMatchIndex,
  occurrenceCount,
  selectedMatch,
} from "./library-detail-policy";
import type { VisibleTranscriptSegment } from "./library-transcript-panel-types";

type SearchInput = {
  transcriptDraft: string;
  streamChunks: string[];
  visibleSegments: VisibleTranscriptSegment[];
  showSegmentView: boolean;
  showStreaming: boolean;
  query: string;
  activeIndex: number;
  setQuery: Dispatch<SetStateAction<string>>;
  setActiveIndex: Dispatch<SetStateAction<number>>;
};

export function createLibraryDetailSearch(input: SearchInput) {
  const query = input.query.trim();
  const segmentMatches = input.showSegmentView
    ? matchingIndexes(
        input.visibleSegments,
        query,
        ({ segment }) => segment.text,
      )
    : [];
  const streamMatches = input.showStreaming
    ? matchingIndexes(input.streamChunks, query, (chunk) => chunk)
    : [];
  const textMatch =
    query && !input.showSegmentView && !input.showStreaming
      ? input.transcriptDraft.toLowerCase().indexOf(query.toLowerCase())
      : -1;
  const label = !query
    ? null
    : input.showSegmentView
      ? indexedMatchLabel(segmentMatches, input.activeIndex)
      : input.showStreaming
        ? indexedMatchLabel(streamMatches, input.activeIndex)
        : String(occurrenceCount(input.transcriptDraft, query));

  const change = (value: string) => {
    input.setQuery(value);
    input.setActiveIndex(0);
  };
  const navigate = (direction: -1 | 1) => {
    if (!query) return;
    const matches = input.showSegmentView
      ? segmentMatches
      : input.showStreaming
        ? streamMatches
        : [];
    if (!matches.length) return;
    input.setActiveIndex((current) =>
      nextMatchIndex(current, direction, matches.length),
    );
  };

  return {
    query,
    segmentMatches,
    streamMatches,
    textMatch,
    label,
    change,
    navigate,
    activeSegmentMatch: selectedMatch(segmentMatches, input.activeIndex),
    activeStreamMatch: selectedMatch(streamMatches, input.activeIndex),
  };
}
