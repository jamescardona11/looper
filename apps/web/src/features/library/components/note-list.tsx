import type { Note } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { Badge, Card } from "@/shared/components/ui";

export function NoteList({ notes }: { notes: Note[] }) {
  const { t, locale } = useTranslation();
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {notes.map((note) => (
        <li key={note.id}>
          <Card className="h-full p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Badge variant="outline">
                {note.kind === "dictation" ? t("library.dictationNote") : t("library.note")}
              </Badge>
              <time
                className="text-muted-foreground text-xs"
                dateTime={new Date(note.updatedAt).toISOString()}
              >
                {formatter.format(note.updatedAt)}
              </time>
            </div>
            <h2 className="font-medium text-lg tracking-tight">
              {note.title || t("library.untitled")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-muted-foreground text-sm leading-6">
              {note.body}
            </p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
