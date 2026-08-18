import type { MeetingSession, Note } from "@looper/data";

export type LibraryFilter = "all" | "notes" | "meetings";
export type LibraryItem =
  | {
      id: string;
      kind: "note" | "dictation";
      title: string;
      preview: string;
      updatedAt: number;
    }
  | {
      id: string;
      kind: "meeting";
      title: string;
      preview: string;
      updatedAt: number;
      state: MeetingSession["state"];
    };

export function buildLibraryItems(
  notes: Note[],
  meetings: MeetingSession[],
  filter: LibraryFilter,
): LibraryItem[] {
  const noteItems: LibraryItem[] = notes.map((note) => ({
    id: note.id,
    kind: note.kind === "dictation" ? "dictation" : "note",
    title: note.title,
    preview: note.body.trim() || "Nota vacía",
    updatedAt: note.updatedAt,
  }));
  const meetingItems: LibraryItem[] = meetings.map((meeting) => ({
    id: meeting.meetingId,
    kind: "meeting",
    title: meeting.title,
    preview: meetingPreview(meeting),
    updatedAt: meeting.lastActiveAt,
    state: meeting.state,
  }));

  return [
    ...(filter === "meetings" ? [] : noteItems),
    ...(filter === "notes" ? [] : meetingItems),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

function meetingPreview(meeting: MeetingSession): string {
  if (meeting.state === "active") return "Meeting en curso";
  if (meeting.state === "paused") return "Meeting pausado";
  return "Resumen, notas y transcripción";
}
