import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "./useMountEffect";

export function useCopyToClipboard(resetMs = 2_000) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  const cancelScheduledReset = useCallback(() => {
    if (resetTimer.current === null) return;
    window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelScheduledReset();
    setCopied(false);
  }, [cancelScheduledReset]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        cancelScheduledReset();
        setCopied(true);
        resetTimer.current = window.setTimeout(() => {
          resetTimer.current = null;
          setCopied(false);
        }, resetMs);
        return true;
      } catch (error) {
        console.error("Failed to copy:", error);
        setCopied(false);
        return false;
      }
    },
    [cancelScheduledReset, resetMs],
  );

  useMountEffect(() => cancelScheduledReset);

  return { copied, copy, reset };
}
