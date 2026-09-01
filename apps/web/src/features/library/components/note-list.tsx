import type { Note } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconFileText } from "@tabler/icons-react";

function notePreview(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)]|>)\s+/, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_~`]/g, ""),
    )
    .filter(Boolean)
    .join(" ");
}

export function NoteList({
  notes,
  onSelect,
}: {
  notes: Note[];
  onSelect: (noteId: string) => void;
}) {
  const { t, locale } = useTranslation();
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <ol className="border-border border-t">
      {notes.map((note) => (
        <li key={note.id} className="border-border border-b">
          <button
            type="button"
            onClick={() => onSelect(note.id)}
            className="group grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-4 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
          >
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-xl bg-[var(--web-highlight)] text-primary"
            >
              <IconFileText className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-foreground text-sm tracking-tight group-hover:text-primary">
                {note.title || t("library.untitled")}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
                <time dateTime={new Date(note.updatedAt).toISOString()}>
                  {formatter.format(note.updatedAt)}
                </time>
                <span aria-hidden="true">·</span>
                <span className="truncate">
                  {note.kind === "dictation" ? t("library.dictationNote") : t("library.note")}
                </span>
                {note.body ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{notePreview(note.body)}</span>
                  </>
                ) : null}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="pr-1 text-muted-foreground transition-colors group-hover:text-primary"
            >
              →
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
