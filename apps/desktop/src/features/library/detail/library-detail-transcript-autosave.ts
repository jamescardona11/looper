import { useRef, type Dispatch, type SetStateAction } from "react";

import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import type { LibraryDetailProps } from "./library-detail-types";

type AutosaveInput = {
  source: string;
  value: string;
  available: boolean;
  onUpdate: LibraryDetailProps["onUpdate"];
  setValue: Dispatch<SetStateAction<string>>;
};

export function useTranscriptAutosave(input: AutosaveInput) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(input);
  latest.current = input;

  useMountEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  });

  return (value: string) => {
    input.setValue(value);
    if (timer.current) clearTimeout(timer.current);
    if (!input.available) return;
    timer.current = setTimeout(() => {
      const current = latest.current;
      if (current.value !== value || current.source === value) return;
      void Promise.resolve(current.onUpdate({ transcript: value })).catch(
        (error) => {
          console.error("failed to save transcript:", error);
        },
      );
    }, 600);
  };
}
