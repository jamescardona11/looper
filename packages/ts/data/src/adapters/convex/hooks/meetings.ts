import { api } from "@looper/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type {
  MeetingBrief,
  MeetingContext,
  MeetingContextKind,
  MeetingSession,
  MeetingSessionState,
  MeetingTranscriptSegment,
  MeetingTranscriptStatus,
} from "../../../types";

type MeetingSessionRow = Omit<MeetingSession, "endedAt"> & { endedAt?: number };
type MeetingTranscriptRow = Omit<MeetingTranscriptSegment, "id" | "speaker"> & {
  _id: string;
  speaker?: string;
};
type MeetingContextRow = Omit<MeetingContext, "id" | "sourceUrl"> & {
  _id: string;
  sourceUrl?: string;
};

function meetingSessionFromRow(row: MeetingSessionRow): MeetingSession {
  return { ...row, endedAt: row.endedAt ?? null };
}

function transcriptSegmentFromRow(row: MeetingTranscriptRow): MeetingTranscriptSegment {
  const { _id, speaker, ...segment } = row;
  return { ...segment, id: _id, speaker: speaker ?? null };
}

function meetingContextFromRow(row: MeetingContextRow): MeetingContext {
  const { _id, sourceUrl, ...context } = row;
  return { ...context, id: _id, sourceUrl: sourceUrl ?? null };
}

export function useMeetingSessions({ limit = 50 }: { limit?: number } = {}): {
  sessions: MeetingSession[];
  isLoading: boolean;
  start: (input: {
    meetingId: string;
    title: string;
    sharingEnabled: boolean;
  }) => Promise<{ meetingId: string; nextSequence: number }>;
  setState: (input: {
    meetingId: string;
    state: MeetingSessionState;
    sharingEnabled: boolean;
  }) => Promise<void>;
  appendTranscript: (input: {
    meetingId: string;
    sequence: number;
    timestampMs: number;
    speaker?: string;
    text: string;
    status: MeetingTranscriptStatus;
  }) => Promise<{ nextSequence: number }>;
  addContext: (input: {
    meetingId: string;
    kind: MeetingContextKind;
    title: string;
    content: string;
    sourceUrl?: string;
  }) => Promise<string>;
} {
  const rows = useQuery(api.meetings.sessions.listSessions, { limit });
  const startMutation = useMutation(api.meetings.sessions.startSession);
  const setStateMutation = useMutation(api.meetings.sessions.setSessionState);
  const appendTranscriptMutation = useMutation(api.meetings.sessions.appendTranscript);
  const addContextMutation = useMutation(api.meetings.sessions.addContext);

  const start = useCallback(
    async (input: { meetingId: string; title: string; sharingEnabled: boolean }) =>
      await startMutation(input),
    [startMutation],
  );
  const setState = useCallback(
    async (input: {
      meetingId: string;
      state: MeetingSessionState;
      sharingEnabled: boolean;
    }) => {
      await setStateMutation(input);
    },
    [setStateMutation],
  );
  const appendTranscript = useCallback(
    async (input: {
      meetingId: string;
      sequence: number;
      timestampMs: number;
      speaker?: string;
      text: string;
      status: MeetingTranscriptStatus;
    }) => await appendTranscriptMutation(input),
    [appendTranscriptMutation],
  );
  const addContext = useCallback(
    async (input: {
      meetingId: string;
      kind: MeetingContextKind;
      title: string;
      content: string;
      sourceUrl?: string;
    }) => String(await addContextMutation(input)),
    [addContextMutation],
  );

  return {
    sessions: Array.isArray(rows) ? (rows as MeetingSessionRow[]).map(meetingSessionFromRow) : [],
    isLoading: rows === undefined,
    start,
    setState,
    appendTranscript,
    addContext,
  };
}

export function useMeetingDetail(meetingId: string | null): {
  session: MeetingSession | null;
  transcript: MeetingTranscriptSegment[];
  contexts: MeetingContext[];
  brief: MeetingBrief | null;
  isLoading: boolean;
} {
  const sessionRow = useQuery(
    api.meetings.sessions.getSession,
    meetingId ? { meetingId } : "skip",
  );
  const transcriptPage = useQuery(
    api.meetings.sessions.getTranscriptSince,
    meetingId ? { meetingId, afterSequence: 0, limit: 200 } : "skip",
  );
  const brief = useQuery(
    api.meetings.sessions.getMeetingBrief,
    meetingId ? { meetingId } : "skip",
  );
  const contextRows = useQuery(
    api.meetings.sessions.listContexts,
    meetingId ? { meetingId } : "skip",
  );

  return {
    session: sessionRow ? meetingSessionFromRow(sessionRow as MeetingSessionRow) : null,
    transcript: Array.isArray(transcriptPage?.segments)
      ? (transcriptPage.segments as MeetingTranscriptRow[]).map(transcriptSegmentFromRow)
      : [],
    contexts: Array.isArray(contextRows)
      ? (contextRows as MeetingContextRow[]).map(meetingContextFromRow)
      : [],
    brief: (brief as MeetingBrief | undefined) ?? null,
    isLoading:
      meetingId !== null &&
      (sessionRow === undefined ||
        transcriptPage === undefined ||
        brief === undefined ||
        contextRows === undefined),
  };
}
