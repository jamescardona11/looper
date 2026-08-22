import { invoke } from "@tauri-apps/api/core";
import type { MeetingCaptureState } from "../../contracts/index";

export async function startNoteFromDock(): Promise<MeetingCaptureState> {
  return invoke<MeetingCaptureState>("start_note_from_dock");
}
