import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "./useMountEffect";

export function useCopyToClipboard(resetMs = 2_000) {
  const [status, setStatus] = useState<"idle" | "confirmed">("idle");
  const resetTimer = useRef<number | null>(null);

  const cancelScheduledReset = useCallback(() => {
    if (resetTimer.current === null) return;
    window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelScheduledReset();
    setStatus("idle");
  }, [cancelScheduledReset]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        cancelScheduledReset();
        setStatus("confirmed");
        resetTimer.current = window.setTimeout(() => {
          resetTimer.current = null;
          setStatus("idle");
        }, resetMs);
        return true;
      } catch (error) {
        console.error("Failed to copy:", error);
        setStatus("idle");
        return false;
      }
    },
    [cancelScheduledReset, resetMs],
  );

  useMountEffect(() => cancelScheduledReset);

  return { copied: status === "confirmed", copy, reset };
}
