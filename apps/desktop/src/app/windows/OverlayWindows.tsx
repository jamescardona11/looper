import { useEffect, useState } from "react";

import {
  getMeetingAwarenessState,
  subscribeMeetingAwareness,
  type MeetingAwarenessState,
} from "../../data/meeting/meeting-awareness";
import MeetingAwarenessOverlay from "../../features/library/meeting/MeetingAwarenessOverlay";
import { meetingCaptureIsVisible } from "../../features/library/meeting/meeting-capture-visibility";
import { useMeetingCapture } from "../../features/library/queries";
import PillOverlay from "../../features/pill/PillOverlay";
import { useOverlayPosition } from "../../features/pill/useOverlayPosition";
import ToastOverlay from "../../features/toast/ToastOverlay";

const centeredWindowClass =
  "flex h-screen w-screen items-center justify-center overflow-hidden";

export function MainOverlayWindow() {
  const meeting = useMeetingCapture().data;
  const meetingActive =
    meeting != null && meetingCaptureIsVisible(meeting.phase);
  useOverlayPosition(true);

  return (
    <div className={centeredWindowClass}>
      <PillOverlay meeting={meetingActive ? meeting : undefined} />
    </div>
  );
}

export function ToastWindow() {
  return (
    <div className={centeredWindowClass}>
      <ToastOverlay />
    </div>
  );
}

export function MeetingAwarenessWindow() {
  const [state, setState] = useState<MeetingAwarenessState>({ phase: "idle" });

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void getMeetingAwarenessState().then((next) => {
      if (active) setState(next);
    });
    void subscribeMeetingAwareness((next) => {
      if (active) setState(next);
    }).then((unlisten) => {
      if (active) stop = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen items-start justify-end overflow-hidden">
      <MeetingAwarenessOverlay state={state} />
    </div>
  );
}
