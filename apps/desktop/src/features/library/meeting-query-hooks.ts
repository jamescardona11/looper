import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as libraryApi from "../../data/library";
import type {
  MeetingCaptureState,
  MeetingDetails,
  MeetingNotesUpdate,
  MeetingStartOptions,
} from "../../contracts";
import { isLibraryListKey, libraryKeys } from "./library-query-keys";
import { appendFinalTranscript } from "./meeting-query-cache";

export function useMeetingCapture(enabled: boolean = true) {
  const client = useQueryClient();
  const previousPhase = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let release: (() => void) | undefined;
    void libraryApi
      .subscribeMeetingCaptureState((state) => {
        if (disposed) return;
        client.setQueryData(libraryKeys.meetingCapture(), state);
        if (previousPhase.current !== state.phase) {
          previousPhase.current = state.phase;
          void client.invalidateQueries({
            predicate: ({ queryKey }) => isLibraryListKey(queryKey),
          });
        }
      })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else release = unsubscribe;
      });
    return () => {
      disposed = true;
      release?.();
    };
  }, [client, enabled]);

  return useQuery({
    queryKey: libraryKeys.meetingCapture(),
    queryFn: libraryApi.getMeetingCaptureState,
    enabled,
  });
}

function useCaptureMutation<Data, Variables>(
  mutationFn: (variables: Variables) => Promise<Data>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (state) => {
      client.setQueryData(libraryKeys.meetingCapture(), state);
      void client.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useStartMeetingCapture() {
  return useCaptureMutation((options: MeetingStartOptions) =>
    libraryApi.startMeetingCapture(options),
  );
}

export function useStartVoiceNoteCapture() {
  return useCaptureMutation<MeetingCaptureState, void>(() =>
    libraryApi.startNoteFromDock(),
  );
}

export function useResumeCapture() {
  return useCaptureMutation((id: string) => libraryApi.resumeCapture(id));
}

export function useStopMeetingCapture() {
  return useCaptureMutation<MeetingCaptureState, void>(() =>
    libraryApi.stopMeetingCapture(),
  );
}

export function useMeetingDetails(id: string, enabled: boolean = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let release: (() => void) | undefined;
    void libraryApi
      .subscribeMeetingDetails({
        detailsChanged: (details) => {
          if (!disposed && details.library_item_id === id) {
            client.setQueryData(libraryKeys.meetingDetails(id), details);
          }
        },
        transcriptUpdate: (update) => {
          if (!disposed && update.meeting_id === id && update.is_final) {
            client.setQueryData<MeetingDetails>(
              libraryKeys.meetingDetails(id),
              (details) => appendFinalTranscript(details, update),
            );
          }
        },
      })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else release = unsubscribe;
      });
    return () => {
      disposed = true;
      release?.();
    };
  }, [client, enabled, id]);

  return useQuery({
    queryKey: libraryKeys.meetingDetails(id),
    queryFn: () => libraryApi.getMeetingDetails(id),
    enabled,
  });
}

export function useUpdateMeetingNotes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MeetingNotesUpdate }) =>
      libraryApi.updateMeetingNotes(id, update),
    onSuccess: (details) =>
      client.setQueryData(
        libraryKeys.meetingDetails(details.library_item_id),
        details,
      ),
  });
}

export function useGenerateMeetingSummary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: libraryApi.generateMeetingSummary,
    onSuccess: (details) => {
      if (details) {
        client.setQueryData(
          libraryKeys.meetingDetails(details.library_item_id),
          details,
        );
      }
    },
  });
}

export function useAskMeeting() {
  return useMutation({
    mutationFn: ({ id, question }: { id: string; question: string }) =>
      libraryApi.askMeeting(id, question),
  });
}
