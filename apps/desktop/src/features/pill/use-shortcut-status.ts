import { useState } from "react";
import {
  refreshShortcutStatus,
  type ShortcutStatus,
} from "../../data/capture/shortcuts";
import { useMountEffect } from "../../shared/hooks/useMountEffect";

// The panel does not take focus, so permissions must refresh even while the
// person is in System Settings. Serial polling avoids overlapping retries.
export function useShortcutStatus() {
  const [status, setStatus] = useState<ShortcutStatus | "checking">("checking");
  useMountEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      let next: ShortcutStatus;
      try {
        next = await refreshShortcutStatus();
      } catch {
        next = "unavailable";
      }
      if (disposed) return;
      setStatus(next);
      timer = setTimeout(refresh, 1_500);
    };
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  });
  return status;
}
