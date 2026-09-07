import type { Note } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowLeft, IconCheck, IconCopy } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { MarkdownContent } from "@/shared/components/markdown-content";
import { Badge, Button } from "@/shared/components/ui";

export function NoteDetail({ note, onBack }: { note: Note; onBack: () => void }) {
  const { t, locale } = useTranslation();
  const [copied, setCopied] = useState(false);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [locale],
  );
  const noteType = note.kind === "dictation" ? t("library.dictationNote") : t("library.note");

  function copyNote() {
    void navigator.clipboard
      .writeText(note.body)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      })
      .catch(() => undefined);
  }

  return (
    <section aria-labelledby="note-title" className="mx-auto max-w-5xl">
      <header className="border-border border-b pb-7">
        <div className="flex min-h-11 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 min-h-11 gap-1.5 text-muted-foreground hover:text-foreground sm:min-h-10"
          >
            <IconArrowLeft className="size-4" aria-hidden />
            {t("common.back")}
          </Button>
          <div className="hidden items-center gap-2 border-border border-l pl-3 text-muted-foreground text-xs sm:flex">
            <Badge variant="outline">{noteType}</Badge>
            <span aria-hidden>·</span>
            <span>{t("library.notes")}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyNote}
            className="ml-auto min-h-11 gap-1.5 sm:min-h-10"
          >
            {copied ? <IconCheck aria-hidden /> : <IconCopy aria-hidden />}
            {copied ? t("library.copied") : t("library.copyNote")}
          </Button>
        </div>
        <div className="mt-7">
          <Badge variant="outline" className="mb-4 sm:hidden">
            {noteType}
          </Badge>
          <h1
            id="note-title"
            className="font-display font-semibold text-3xl tracking-[-0.04em] sm:text-[32px]"
          >
            {note.title || t("library.untitled")}
          </h1>
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground text-xs">
            <div className="flex items-center gap-1.5">
              <dt>{t("library.created")}</dt>
              <dd>
                <time dateTime={new Date(note.createdAt).toISOString()}>
                  {formatter.format(note.createdAt)}
                </time>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>{t("library.lastUpdated")}</dt>
              <dd>
                <time dateTime={new Date(note.updatedAt).toISOString()}>
                  {formatter.format(note.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <article className="max-w-3xl py-8 text-[15px] text-foreground/90 leading-7 sm:py-10">
        {note.body ? (
          <MarkdownContent content={note.body} variant="document" />
        ) : (
          <p className="text-muted-foreground">{t("library.emptyNotesHint")}</p>
        )}
      </article>
    </section>
  );
}
