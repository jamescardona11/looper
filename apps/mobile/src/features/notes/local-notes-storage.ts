import type { Note } from "@looper/data";
import { File, Paths } from "expo-file-system";
import { normalizeStoredNotes, sortNotesByUpdatedAt } from "./local-notes-logic";

const notesFile = new File(Paths.document, "looper-notes-v1.json");

export async function loadLocalNotes(): Promise<Note[]> {
  if (!notesFile.exists) return [];

  try {
    const payload = JSON.parse(await notesFile.text()) as { notes?: unknown };
    return sortNotesByUpdatedAt(normalizeStoredNotes(payload.notes));
  } catch {
    throw new Error("No se pudieron abrir las notas guardadas en este dispositivo.");
  }
}
