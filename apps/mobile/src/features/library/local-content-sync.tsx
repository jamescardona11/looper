import { useDictationHistory, useNotes } from "@looper/data";
import { type ReactNode, useEffect, useRef } from "react";
import { loadLocalNotes } from "@/features/notes/local-notes-storage";

/** Migrates the previous RN device store without duplicating rows on later launches. */
export function LocalContentSync({ children }: { children: ReactNode }) {
  const notes = useNotes({ loadList: false });
  const dictations = useDictationHistory({ loadList: false });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadLocalNotes()
      .then(async (localNotes) => {
        await Promise.all(
          localNotes.map(async (note) => {
            await notes.upsertFromDevice({ ...note, sourceId: note.id });
            if (note.kind === "dictation" && note.body.trim()) {
              await dictations.record({
                text: note.body,
                sourceId: note.id,
                occurredAt: note.createdAt,
              });
            }
          }),
        );
      })
      .catch((cause: unknown) => {
        if (__DEV__) console.warn("No se pudo migrar el contenido local", cause);
      });
  }, [dictations, notes]);

  return children;
}
