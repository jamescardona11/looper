import type { CSSProperties } from "react";
import type { MeetingCaptureState } from "../../types";
import MeetingCaptureOverlay from "../library/components/MeetingCaptureOverlay";
import { DictationPillOverlay } from "./pill-dictation-overlay";

// Tailwind source markers for the exact compact overlay typography classes:
// text-[10px] text-[11px]

export type PillOverlayProps = {
  className?: string;
  style?: CSSProperties;
  sensitivity?: number;
  decay?: number;
  meeting?: MeetingCaptureState;
};

export default function PillOverlay({
  meeting,
  ...dictation
}: PillOverlayProps) {
  if (meeting) {
    return (
      <MeetingCaptureOverlay key={meeting.id ?? "meeting"} state={meeting} />
    );
  }

  return <DictationPillOverlay {...dictation} />;
}
