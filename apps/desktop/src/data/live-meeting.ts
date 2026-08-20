// Desktop → Mobile Live Meeting Companion bridge.
//
// Only text emitted by the existing local meeting transcript is sent. The
// opt-in is stored locally, defaults to off, and stopping sharing immediately
// stops writes at both the client and Convex layers.
import { api } from "@looper/backend/convex/_generated/api";
import { listen } from "@tauri-apps/api/event";
import { createConvexClient, ensureAnonymousSession } from "./convex-auth";

const SHARING_STORAGE_KEY = "looper.liveMeeting.shareTranscript";
const DEVICE_ID_STORAGE_KEY = "looper.liveMeeting.desktopDeviceId";
const SHARING_CHANGE_EVENT = "looper:live-meeting-sharing-change";

type TranscriptUpdate = {
  id: string;
  meeting_id: string;
  source: "you" | "them";
  text: string;
  start_ms: number;
  end_ms: number;
  is_final: boolean;
};

type MeetingCaptureState = {
  id?: string | null;
  phase:
    "idle" | "starting" | "recording" | "finalizing" | "processing" | "error";
};

// El audio ya paró en `processing`: para quien mira en remoto la sesión ha
// terminado, aunque la píldora siga contando el resumen.
const RECORDING_OVER: ReadonlySet<MeetingCaptureState["phase"]> = new Set([
  "idle",
  "processing",
  "error",
]);

export function isLiveMeetingSharingEnabled(): boolean {
  return localStorage.getItem(SHARING_STORAGE_KEY) === "true";
}

export function setLiveMeetingSharingEnabled(enabled: boolean): void {
  localStorage.setItem(SHARING_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(SHARING_CHANGE_EVENT));
}

function desktopDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
  return created;
}

/** Starts one publisher per main window and returns a full cleanup function. */
export function startLiveMeetingPublisher(): () => void {
  const client = createConvexClient();
  if (!client) return () => {};
  ensureAnonymousSession(client);

  const nextSequence = new Map<string, number>();
  const publishedMeetings = new Set<string>();
  const knownMeetings = new Set<string>();
  let pending = Promise.resolve();
  let closed = false;
  let sharingGeneration = 0;

  const enqueue = (job: () => Promise<void>) => {
    pending = pending.then(job).catch((error) => {
      console.warn("[live-meeting] transcript publish failed", error);
    });
  };

  const transcriptReady = listen<TranscriptUpdate>(
    "meeting:transcript_update",
    ({ payload }) => {
      if (closed || !isLiveMeetingSharingEnabled() || !payload.text.trim())
        return;
      const generation = sharingGeneration;
      enqueue(async () => {
        if (
          closed ||
          generation !== sharingGeneration ||
          !isLiveMeetingSharingEnabled()
        ) {
          return;
        }
        if (!publishedMeetings.has(payload.meeting_id)) {
          const started = await client.mutation(
            (api as any).meetings.sessions.startSession,
            {
              meetingId: payload.meeting_id,
              title: "Live meeting",
              sharingEnabled: true,
            },
          );
          publishedMeetings.add(payload.meeting_id);
          knownMeetings.add(payload.meeting_id);
          nextSequence.set(payload.meeting_id, started.nextSequence);
          await client.mutation(
            (api as any).meetings.sessions.registerCompanionDevice,
            {
              meetingId: payload.meeting_id,
              deviceId: desktopDeviceId(),
              name: "Desktop",
            },
          );
        }
        if (
          closed ||
          generation !== sharingGeneration ||
          !isLiveMeetingSharingEnabled()
        ) {
          if (publishedMeetings.has(payload.meeting_id)) {
            await client.mutation(
              (api as any).meetings.sessions.setSessionState,
              {
                meetingId: payload.meeting_id,
                state: "paused",
                sharingEnabled: false,
              },
            );
            publishedMeetings.delete(payload.meeting_id);
            nextSequence.delete(payload.meeting_id);
          }
          return;
        }
        const sequence = nextSequence.get(payload.meeting_id) ?? 1;
        const result = await client.mutation(
          (api as any).meetings.sessions.appendTranscript,
          {
            meetingId: payload.meeting_id,
            sequence,
            timestampMs: payload.end_ms,
            speaker: payload.source,
            text: payload.text,
            status: payload.is_final ? "final" : "partial",
          },
        );
        nextSequence.set(payload.meeting_id, result.nextSequence);
      });
    },
  );

  const captureReady = listen<MeetingCaptureState>(
    "meeting:capture_state",
    ({ payload }) => {
      if (!RECORDING_OVER.has(payload.phase)) return;
      const meetingId = payload.id;
      if (!meetingId || !knownMeetings.has(meetingId)) return;
      enqueue(async () => {
        await client.mutation((api as any).meetings.sessions.setSessionState, {
          meetingId,
          state: "ended",
          sharingEnabled: false,
        });
        publishedMeetings.delete(meetingId);
        knownMeetings.delete(meetingId);
        nextSequence.delete(meetingId);
      });
    },
  );

  const pauseSharing = () => {
    if (isLiveMeetingSharingEnabled()) return;
    sharingGeneration += 1;
    for (const meetingId of publishedMeetings) {
      void client
        .mutation((api as any).meetings.sessions.setSessionState, {
          meetingId,
          state: "paused",
          sharingEnabled: false,
        })
        .catch((error) =>
          console.warn("[live-meeting] transcript pause failed", error),
        );
    }
    publishedMeetings.clear();
    nextSequence.clear();
  };
  window.addEventListener(SHARING_CHANGE_EVENT, pauseSharing);

  return () => {
    closed = true;
    window.removeEventListener(SHARING_CHANGE_EVENT, pauseSharing);
    void Promise.all([transcriptReady, captureReady]).then(
      ([stopTranscript, stopCapture]) => {
        stopTranscript();
        stopCapture();
      },
    );
    void pending.finally(() => client.close());
  };
}
