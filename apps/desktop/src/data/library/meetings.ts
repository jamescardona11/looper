import { invoke } from "@tauri-apps/api/core";
import type {
  MeetingCaptureState,
  MeetingDetails,
  MeetingNoteMarker,
  MeetingNotesUpdate,
} from "../../contracts";

// El inicio normal no debería abrir un segundo formulario. El backend resuelve
// el modelo compatible y las preferencias guardadas en un único sitio.
export const startDefaultMeetingCapture = (): Promise<MeetingCaptureState> =>
  invoke("start_default_meeting_capture");

export const stopMeetingCapture = (): Promise<MeetingCaptureState> =>
  invoke("stop_meeting_capture");

// Sigue grabando sobre una captura terminada: el audio nuevo va detrás del que
// ya había, y el fichero entero se vuelve a transcribir.
export const resumeCapture = (id: string): Promise<MeetingCaptureState> =>
  invoke("resume_capture", { id });

export const getMeetingCaptureState = (): Promise<MeetingCaptureState> =>
  invoke("get_meeting_capture_state");

export const captureMeetingNote = (): Promise<MeetingNoteMarker> =>
  invoke("capture_meeting_note");

export async function openMicrophoneSettings(): Promise<void> {
  await invoke("open_microphone_settings");
}

export async function openSystemAudioSettings(): Promise<void> {
  await invoke("open_system_audio_settings");
}

export const getMeetingDetails = (id: string): Promise<MeetingDetails> =>
  invoke("get_meeting_details", { id });

export const updateMeetingNotes = (
  id: string,
  update: MeetingNotesUpdate,
): Promise<MeetingDetails> => invoke("update_meeting_notes", { id, update });

export const generateMeetingSummary = (
  id: string,
): Promise<MeetingDetails | null> => invoke("generate_meeting_summary", { id });

export const askMeeting = (id: string, question: string): Promise<string> =>
  invoke("ask_meeting", { id, question });
