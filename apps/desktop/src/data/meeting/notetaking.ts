import { invoke } from "@tauri-apps/api/core";
import type { MeetingCaptureState } from "../../contracts/index";
import { rejectCaptureStart } from "./capture-start-error";

export async function startNoteFromDock(): Promise<MeetingCaptureState> {
  return invoke<MeetingCaptureState>("start_note_from_dock").catch(
    rejectCaptureStart,
  );
}
