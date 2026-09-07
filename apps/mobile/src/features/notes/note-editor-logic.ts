export const UNTITLED_NOTE_TITLE = "Untitled note";

export function persistedNoteTitle(title: string): string {
  return title.trim() || UNTITLED_NOTE_TITLE;
}

export function displayNoteTitle(title: string): string {
  const normalized = title.trim();
  return !normalized || normalized === UNTITLED_NOTE_TITLE ? "Sin título" : normalized;
}

export function hasUnsavedNoteChanges({
  draftTitle,
  draftBody,
  savedTitle,
  savedBody,
}: {
  draftTitle: string;
  draftBody: string;
  savedTitle: string;
  savedBody: string;
}): boolean {
  return persistedNoteTitle(draftTitle) !== savedTitle || draftBody !== savedBody;
}
