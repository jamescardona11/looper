import { useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  const [status, setStatus] = useState<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const draft = useRef(input.value);
  const saved = useRef(input.source);
  const writing = useRef<Promise<boolean> | null>(null);

  useMountEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  });

  const save = (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (writing.current) return writing.current;
    const write = async () => {
      if (!latest.current.available) return false;
      try {
        while (draft.current !== saved.current) {
          const value = draft.current;
          setStatus("saving");
          await latest.current.onUpdate({ transcript: value });
          saved.current = value;
        }
        setStatus("saved");
        return true;
      } catch {
        setStatus("error");
        return false;
      }
    };
    writing.current = write().finally(() => {
      writing.current = null;
    });
    return writing.current;
  };

  const change = (value: string) => {
    draft.current = value;
    input.setValue(value);
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save();
    }, 600);
  };

  const close = (onClose: () => void) => {
    if (status === "saved") onClose();
    else
      void save().then((saved) => {
        if (saved) onClose();
      });
  };

  return { change, save, status, close };
}
