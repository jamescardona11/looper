import type { Note } from "@looper/data";

const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 100_000;

export function createLocalNote({
  id,
  title,
  body,
  kind = "note",
  now,
}: {
  id: string;
  title: string;
  body: string;
  kind?: "note" | "dictation";
  now: number;
}): Note {
  return {
    id,
    kind,
    title: normalizeTitle(title),
    body: normalizeBody(body),
    createdAt: now,
    updatedAt: now,
  };
}

export function updateLocalNote({
  note,
  title,
  body,
  now,
}: {
  note: Note;
  title: string;
  body: string;
  now: number;
}): Note {
  return {
    ...note,
    title: normalizeTitle(title),
    body: normalizeBody(body),
    updatedAt: now,
  };
}

export function sortNotesByUpdatedAt(notes: Note[]): Note[] {
  return [...notes].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function normalizeStoredNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const note = item as Partial<Note>;
    if (
      typeof note.id !== "string" ||
      typeof note.title !== "string" ||
      typeof note.body !== "string" ||
      typeof note.createdAt !== "number" ||
      typeof note.updatedAt !== "number"
    ) {
      return [];
    }
    return [
      {
        id: note.id,
        kind: note.kind === "dictation" ? "dictation" : "note",
        title: normalizeTitle(note.title),
        body: normalizeBody(note.body),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      },
    ];
  });
}

function normalizeTitle(title: string): string {
  const normalized = title.trim() || "Untitled note";
  if (normalized.length > MAX_TITLE_LENGTH) throw new Error("El título es demasiado largo.");
  return normalized;
}

function normalizeBody(body: string): string {
  if (body.length > MAX_BODY_LENGTH) throw new Error("La nota es demasiado larga.");
  return body;
}
