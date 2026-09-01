import { useDictationHistory, useMeetingSessions, useNotes } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconFileText, IconMicrophone, IconNotes } from "@tabler/icons-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/shared/components/empty-state";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { MeetingList } from "./components/meeting-list";
import { NoteDetail } from "./components/note-detail";
import { NoteList } from "./components/note-list";
import { TranscriptionList } from "./components/transcription-list";

type LibraryView = "transcriptions" | "notes" | "meetings";

export function LibraryPage({
  selectedNoteId,
  onSelectNote,
  onCloseNote,
}: {
  selectedNoteId?: string | null;
  onSelectNote?: (noteId: string) => void;
  onCloseNote?: () => void;
}) {
  const { t } = useTranslation();
  const transcriptions = useDictationHistory();
  const notes = useNotes();
  const meetings = useMeetingSessions();
  const [view, setView] = useState<LibraryView>("transcriptions");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localSelectedNoteId, setLocalSelectedNoteId] = useState<string | null>(null);
  const activeNoteId = selectedNoteId ?? localSelectedNoteId;
  const selectedNote = activeNoteId
    ? notes.notes.find((candidate) => candidate.id === activeNoteId)
    : null;

  const views: Array<{ id: LibraryView; label: string; count: number }> = [
    {
      id: "transcriptions",
      label: t("library.transcriptions"),
      count: transcriptions.items.length,
    },
    { id: "notes", label: t("library.notes"), count: notes.notes.length },
    { id: "meetings", label: t("library.meetings"), count: meetings.sessions.length },
  ];

  const isLoading =
    (view === "transcriptions" && transcriptions.isLoading) ||
    (view === "notes" && notes.isLoading) ||
    (view === "meetings" && meetings.isLoading) ||
    (activeNoteId !== null && notes.isLoading);

  function copyTranscription(id: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2_000);
    });
  }

  function selectNote(noteId: string) {
    if (onSelectNote) {
      onSelectNote(noteId);
      return;
    }
    setLocalSelectedNoteId(noteId);
  }

  function closeNote() {
    if (onCloseNote) {
      onCloseNote();
      return;
    }
    setLocalSelectedNoteId(null);
  }

  if (selectedNote) {
    return (
      <ProductPageLayout width="compact" compactTop>
        <NoteDetail note={selectedNote} onBack={closeNote} />
      </ProductPageLayout>
    );
  }

  return (
    <ProductPageLayout>
      <ProductPageHeader
        eyebrow={t("nav.notes")}
        title={t("web.notes.title")}
        description={t("web.notes.subtitle")}
      />

      <div
        role="tablist"
        aria-label={t("library.title")}
        className="mb-6 flex gap-1 border-border border-b"
      >
        {views.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={view === candidate.id}
            onClick={() => setView(candidate.id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-transparent border-b-2 px-3 py-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground",
              view === candidate.id && "border-primary text-foreground",
            )}
          >
            {candidate.label}
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
              {candidate.count}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div role="status" className="grid gap-3" aria-label={t("common.loading")}>
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-xl bg-secondary/50" />
          ))}
        </div>
      ) : view === "transcriptions" ? (
        transcriptions.items.length > 0 ? (
          <TranscriptionList
            items={transcriptions.items}
            copiedId={copiedId}
            onCopy={copyTranscription}
          />
        ) : (
          <LibraryEmpty
            icon={<IconFileText className="size-6 text-primary" />}
            title={t("library.emptyTranscriptions")}
            description={t("library.emptyTranscriptionsHint")}
          />
        )
      ) : view === "notes" ? (
        notes.notes.length > 0 ? (
          <NoteList notes={notes.notes} onSelect={selectNote} />
        ) : (
          <LibraryEmpty
            icon={<IconNotes className="size-6 text-primary" />}
            title={t("library.emptyNotes")}
            description={t("library.emptyNotesHint")}
          />
        )
      ) : meetings.sessions.length > 0 ? (
        <MeetingList sessions={meetings.sessions} />
      ) : (
        <LibraryEmpty
          icon={<IconMicrophone className="size-6 text-primary" />}
          title={t("library.emptyMeetings")}
          description={t("library.emptyMeetingsHint")}
        />
      )}
    </ProductPageLayout>
  );
}

function LibraryEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
