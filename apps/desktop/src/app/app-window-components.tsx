import {
  MainOverlayWindow,
  MeetingAwarenessWindow,
  ToastWindow,
} from "./OverlayWindows";
import type { DesktopWindowRoute } from "./window-route";

export function OverlayWindows({ route }: { route: DesktopWindowRoute }) {
  switch (route) {
    case "meeting-awareness":
      return <MeetingAwarenessWindow />;
    case "toast":
      return <ToastWindow />;
    case "main-overlay":
      return <MainOverlayWindow />;
    case "settings":
      return null;
  }
}
