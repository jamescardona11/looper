import { useMeetingCommands } from "@looper/data";
import { useCallback, useRef, useState } from "react";
import { type RecordedAudio, useAudioRecorder, useLocalStt } from "@/features/dictation";
import { persistMeetingAudio } from "./meeting-audio-store";
import { addMarkedMoment, createMeetingIdentity } from "./meeting-capture-logic";
import { meetingLiveActivity } from "./native-live-activity";

export type MeetingCapturePhase =
  | "ready"
  | "starting"
  | "recording"
  | "processing"
  | "error"
  | "complete";

type ActiveMeeting = { meetingId: string; title: string; nextSequence: number };

export function useMeetingCapture() {
  const recorder = useAudioRecorder();
  const localStt = useLocalStt();
  const meetings = useMeetingCommands();
  const [identity] = useState(() =>
    createMeetingIdentity(Date.now(), Math.random().toString(36).slice(2, 10)),
  );
  const [title, setTitle] = useState(identity.title);
  const [notes, setNotes] = useState("");
  const [moments, setMoments] = useState<number[]>([]);
  const [phase, setPhase] = useState<MeetingCapturePhase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [hasPersistedAudio, setHasPersistedAudio] = useState(false);
  const activeMeeting = useRef<ActiveMeeting | null>(null);
  const pendingAudio = useRef<RecordedAudio | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    if (localStt.status !== "ready") {
      setError("Instala el modelo local antes de empezar el meeting.");
      return false;
    }
    setPhase("starting");
    setError(null);
    setHasPersistedAudio(false);
    const didStartRecording = await recorder.start();
    if (!didStartRecording) {
      setPhase("ready");
      return false;
    }
    try {
      const normalizedTitle = title.trim() || identity.title;
      const session = await meetings.start({
        meetingId: identity.meetingId,
        title: normalizedTitle,
        sharingEnabled: true,
      });
      activeMeeting.current = { ...session, title: normalizedTitle };
      setTitle(normalizedTitle);
      setPhase("recording");
      void meetingLiveActivity
        .start(session.meetingId, normalizedTitle, Date.now())
        .catch(() => undefined);
      return true;
    } catch (cause) {
      await recorder.stop();
      setError(messageFrom(cause, "No se pudo abrir el meeting."));
      setPhase("error");
      return false;
    }
  }, [identity.meetingId, identity.title, localStt.status, meetings, recorder, title]);

  const processAudio = useCallback(
    async (audio: RecordedAudio): Promise<string | null> => {
      const active = activeMeeting.current;
      if (!active) return null;
      setPhase("processing");
      setError(null);
      void meetingLiveActivity
        .update(active.meetingId, "processing", moments.length)
        .catch(() => undefined);
      try {
        // El original debe sobrevivir aunque falle STT o cualquier escritura remota.
        await persistMeetingAudio(active.meetingId, audio.uri);
        setHasPersistedAudio(true);
        const resumed = await meetings.start({
          meetingId: active.meetingId,
          title: active.title,
          sharingEnabled: true,
        });
        active.nextSequence = resumed.nextSequence;
        const transcript = (await localStt.transcribe(audio.uri)).trim();
        if (transcript) {
          const appended = await meetings.appendTranscript({
            meetingId: active.meetingId,
            sequence: active.nextSequence,
            timestampMs: 0,
            text: transcript,
            status: "final",
          });
          active.nextSequence = appended.nextSequence;
        }
        if (notes.trim()) {
          await meetings.addContext({
            meetingId: active.meetingId,
            kind: "note",
            title: "Mis notas",
            content: notes.trim(),
          });
        }
        if (moments.length > 0) {
          await meetings.addContext({
            meetingId: active.meetingId,
            kind: "note",
            title: "Momentos marcados",
            content: moments.map((timestamp) => String(timestamp)).join("\n"),
          });
        }
        await meetings.setState({
          meetingId: active.meetingId,
          state: "ended",
          sharingEnabled: false,
        });
        pendingAudio.current = null;
        setPhase("complete");
        void meetingLiveActivity.end(active.meetingId, "complete").catch(() => undefined);
        return active.meetingId;
      } catch (cause) {
        await meetings
          .setState({
            meetingId: active.meetingId,
            state: "paused",
            sharingEnabled: false,
          })
          .catch(() => undefined);
        setError(messageFrom(cause, "No se pudo procesar el meeting."));
        setPhase("error");
        void meetingLiveActivity.end(active.meetingId, "attention").catch(() => undefined);
        return null;
      }
    },
    [localStt, meetings, moments, notes],
  );

  const finish = useCallback(async (): Promise<string | null> => {
    const audio = await recorder.stop();
    if (!audio) {
      setError(recorder.error ?? "No se encontró la grabación del meeting.");
      setPhase("error");
      if (activeMeeting.current) {
        void meetingLiveActivity
          .end(activeMeeting.current.meetingId, "attention")
          .catch(() => undefined);
      }
      return null;
    }
    pendingAudio.current = audio;
    return await processAudio(audio);
  }, [processAudio, recorder]);

  const retry = useCallback(async (): Promise<string | null> => {
    const audio = pendingAudio.current;
    if (!audio) return null;
    return await processAudio(audio);
  }, [processAudio]);

  const markMoment = useCallback(() => {
    setMoments((current) => {
      const next = addMarkedMoment(current, recorder.durationMs);
      if (activeMeeting.current) {
        void meetingLiveActivity
          .update(activeMeeting.current.meetingId, "recording", next.length)
          .catch(() => undefined);
      }
      return next;
    });
  }, [recorder.durationMs]);

  return {
    phase,
    title,
    notes,
    moments,
    durationMs: recorder.durationMs,
    audioLevel: recorder.audioLevel,
    error: error ?? recorder.error ?? localStt.error,
    hasPersistedAudio,
    localSttStatus: localStt.status,
    localSttProgress: localStt.progress,
    localSttMemoryTier: localStt.memoryTier,
    setTitle,
    setNotes,
    installLocalStt: localStt.install,
    start,
    finish,
    retry,
    markMoment,
  };
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
