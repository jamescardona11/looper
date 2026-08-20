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
export type LibraryDayGroup = {
  key: string;
  label: string;
  items: LibraryItem[];
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

/** `now` se inyecta para que el corte de medianoche sea comprobable. */
export function groupLibraryItemsByDay(items: LibraryItem[], now: number): LibraryDayGroup[] {
  const todayKey = dayKey(new Date(now));
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);

  const byDay = new Map<string, LibraryItem[]>();
  for (const item of items) {
    const key = dayKey(new Date(item.updatedAt));
    const group = byDay.get(key);
    if (group) group.push(item);
    else byDay.set(key, [item]);
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([key, group]) => ({
      key,
      label: dayLabel(key, group[0].updatedAt, todayKey, yesterdayKey),
      items: [...group].sort((left, right) => right.updatedAt - left.updatedAt),
    }));
}

export function searchLibraryItems(items: LibraryItem[], query: string): LibraryItem[] {
  const needle = foldForSearch(query).trim();
  if (!needle) return items;
  return items.filter(
    (item) =>
      foldForSearch(item.title).includes(needle) || foldForSearch(item.preview).includes(needle),
  );
}

function meetingPreview(meeting: MeetingSession): string {
  if (meeting.state === "active") return "Meeting en curso";
  if (meeting.state === "paused") return "Meeting pausado";
  return "Resumen, notas y transcripción";
}

const weekdayFormatter = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric" });

function dayLabel(key: string, timestamp: number, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return "HOY";
  if (key === yesterdayKey) return "AYER";
  return weekdayFormatter.format(new Date(timestamp)).toUpperCase();
}

/** Clave local `YYYY-MM-DD`: ordena igual como texto que como fecha. */
function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
