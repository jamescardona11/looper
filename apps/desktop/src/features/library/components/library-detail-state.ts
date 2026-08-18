import type { Dispatch, SetStateAction } from "react";

import type { MeetingReviewView } from "./MeetingReviewPanel";
import type { LibraryItem } from "../../../types";

export type DetailState = {
  sourceName: string;
  sourceTranscript: string;
  sourceStatus: LibraryItem["status"]["type"];
  sourceTimestampPreference: string;
  nameDraft: string;
  isEditingName: boolean;
  transcriptDraft: string;
  streamChunks: string[];
  streamTranscript: string;
  tagInput: string;
  tagMenuOpen: boolean;
  showTimestamps: boolean;
  exportOpen: boolean;
  overflowOpen: boolean;
  showDeleteConfirm: boolean;
  showRetranscribe: boolean;
  showTranslations: boolean;
  searchQuery: string;
  activeSearchIndex: number;
  renamingSpeakerId: string | null;
  speakerNameDraft: string;
  speakerMenuSegment: number | null;
  speakersMenuOpen: boolean;
  speakerFilter: string | null;
  filterMenuOpen: boolean;
  meetingView: MeetingReviewView;
};

const transcriptOf = (item: LibraryItem) => item.transcript ?? "";
const timestampSource = (item: LibraryItem) =>
  `${item.show_timestamps}:${Boolean(item.segments?.length)}`;
const timestampDefault = (item: LibraryItem) =>
  item.show_timestamps && Boolean(item.segments?.length);

export function initialDetailState(item: LibraryItem): DetailState {
  const transcript = transcriptOf(item);
  return {
    sourceName: item.name,
    sourceTranscript: transcript,
    sourceStatus: item.status.type,
    sourceTimestampPreference: timestampSource(item),
    nameDraft: item.name,
    isEditingName: false,
    transcriptDraft: transcript,
    streamChunks: [],
    streamTranscript: transcript,
    tagInput: "",
    tagMenuOpen: false,
    showTimestamps: timestampDefault(item),
    exportOpen: false,
    overflowOpen: false,
    showDeleteConfirm: false,
    showRetranscribe: false,
    showTranslations: false,
    searchQuery: "",
    activeSearchIndex: 0,
    renamingSpeakerId: null,
    speakerNameDraft: "",
    speakerMenuSegment: null,
    speakersMenuOpen: false,
    speakerFilter: null,
    filterMenuOpen: false,
    meetingView: "enhanced",
  };
}

export function synchronizeDetailState(
  current: DetailState,
  item: LibraryItem,
): DetailState {
  const transcript = transcriptOf(item);
  const timestamps = timestampSource(item);
  const nameChanged = current.sourceName !== item.name;
  const transcriptChanged = current.sourceTranscript !== transcript;
  const statusChanged = current.sourceStatus !== item.status.type;
  const timestampsChanged = current.sourceTimestampPreference !== timestamps;
  if (
    !nameChanged &&
    !transcriptChanged &&
    !statusChanged &&
    !timestampsChanged
  ) {
    return current;
  }

  const stream = reconcileStream(current, item.status.type, transcript);
  return {
    ...current,
    ...stream,
    sourceName: item.name,
    sourceTranscript: transcript,
    sourceStatus: item.status.type,
    sourceTimestampPreference: timestamps,
    nameDraft:
      nameChanged && !current.isEditingName ? item.name : current.nameDraft,
    transcriptDraft: transcriptChanged ? transcript : current.transcriptDraft,
    showTimestamps: timestampsChanged
      ? timestampDefault(item)
      : current.showTimestamps,
  };
}

function reconcileStream(
  current: DetailState,
  status: LibraryItem["status"]["type"],
  transcript: string,
): Pick<DetailState, "streamChunks" | "streamTranscript"> {
  if (status !== "transcribing") {
    return { streamChunks: [], streamTranscript: transcript };
  }
  if (transcript === current.streamTranscript || !transcript) {
    return {
      streamChunks: current.streamChunks,
      streamTranscript: current.streamTranscript,
    };
  }
  if (!transcript.startsWith(current.streamTranscript)) {
    const replacement = transcript.trim();
    return {
      streamChunks: replacement ? [replacement] : [],
      streamTranscript: transcript,
    };
  }
  const addition = transcript
    .slice(current.streamTranscript.length)
    .replace(/^\n+/, "")
    .trimStart();
  return {
    streamChunks: addition.trim()
      ? [...current.streamChunks, addition]
      : current.streamChunks,
    streamTranscript: transcript,
  };
}

export type DetailStateSetter = Dispatch<SetStateAction<DetailState>>;

export function fieldSetter<Key extends keyof DetailState>(
  setState: DetailStateSetter,
  field: Key,
): Dispatch<SetStateAction<DetailState[Key]>> {
  return (action) => {
    setState((current) => {
      const previous = current[field];
      const next =
        typeof action === "function"
          ? (action as (value: DetailState[Key]) => DetailState[Key])(previous)
          : action;
      return Object.is(previous, next)
        ? current
        : { ...current, [field]: next };
    });
  };
}
