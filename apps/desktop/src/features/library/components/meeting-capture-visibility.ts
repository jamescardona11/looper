import type { MeetingCapturePhase } from "../../../types";

export const meetingCaptureIsVisible = (phase: MeetingCapturePhase): boolean =>
  phase === "recording" || phase === "finalizing" || phase === "processing";

export const meetingCaptureBlocksStart = (
  phase: MeetingCapturePhase,
): boolean =>
  phase === "starting" || phase === "recording" || phase === "finalizing";
