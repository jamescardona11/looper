import { useLingui } from "@lingui/react/macro";
import {
  MagnifyingGlass as Search,
  Microphone,
  Plus,
  VideoCamera,
  YoutubeLogo,
} from "@phosphor-icons/react";

type LibraryViewToolbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onStartNote: () => void;
  noteDisabled: boolean;
  onOpenMeeting: () => void;
  meetingDisabled: boolean;
  onOpenImport: () => void;
  onOpenYoutube: () => void;
  youtubeDisabled: boolean;
  error: string | null;
  notificationPosition: string;
};

export function LibraryViewToolbar(props: LibraryViewToolbarProps) {
  const { t } = useLingui();
  return (
    <div className="mx-auto flex w-full max-w-[1040px] min-w-0 flex-col gap-4 px-0 pb-4 pt-8 text-left">
      <div className="flex flex-col gap-4">
        <header>
          <p className="ui-text-uppercase-micro ui-color-accent">Notes</p>
          <h1 className="mt-1 font-display ui-text-screen-title font-semibold tracking-[-0.035em] ui-color-primary">
            {t({
              id: "library.view.title",
              message: "Your meetings and recordings.",
            })}
          </h1>
        </header>

        <div className="grid grid-cols-1 gap-2 rounded-[18px] bg-[var(--color-bg-tertiary)] p-2 text-[var(--color-text-primary)] lg:grid-cols-[auto_minmax(14rem,1fr)] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={props.onStartNote}
              disabled={props.noteDisabled}
              className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--color-accent)] px-4 ui-text-body-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Microphone size={14} />
              {t({ id: "library.view.start_note", message: "Start a note" })}
            </button>
            <button
              type="button"
              onClick={props.onOpenMeeting}
              disabled={props.meetingDisabled}
              className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--color-bg-surface)] px-3 ui-text-body-sm ui-color-primary transition-colors hover:bg-[var(--color-bg-overlay)] disabled:opacity-50"
            >
              <VideoCamera size={14} />
              {t({ id: "meeting.start.title", message: "Record meeting" })}
            </button>
            <button
              onClick={props.onOpenImport}
              className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--color-bg-surface)] px-3 ui-text-body-sm ui-color-primary hover:bg-[var(--color-bg-overlay)] transition-colors"
            >
              <Plus size={14} />
              {t({
                id: "library.view.import_button",
                message: "Import",
              })}
            </button>
            <button
              type="button"
              onClick={props.onOpenYoutube}
              disabled={props.youtubeDisabled}
              title={t({
                id: "library.youtube.add_description",
                message: "Download one video's audio and transcribe it",
              })}
              className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--color-bg-surface)] px-3 ui-text-body-sm ui-color-primary hover:bg-[var(--color-bg-overlay)] transition-colors disabled:opacity-50"
            >
              <YoutubeLogo size={14} />
              {t({ id: "library.youtube.add", message: "Add link" })}
            </button>
          </div>

          <div className="relative min-w-0 w-full group">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 ui-color-muted transition-colors"
            />
            <input
              type="text"
              placeholder={t({
                id: "library.view.search_placeholder",
                message: "Find a note, person, or tag...",
              })}
              value={props.searchQuery}
              onChange={(event) => props.onSearchChange(event.target.value)}
              className="h-10 w-full rounded-xl bg-[var(--color-bg-surface)] pl-9 pr-4 ui-text-input ui-color-primary placeholder-[var(--color-text-muted)] outline-none transition-[background-color,color] duration-100 ease-out"
            />
          </div>
        </div>
      </div>

      {props.error ? (
        <div
          role="alert"
          aria-live="assertive"
          data-notification-position={props.notificationPosition}
          className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 px-4 py-3 ui-text-body-sm ui-color-error-tint mx-4 mb-2"
        >
          {props.error}
        </div>
      ) : null}
    </div>
  );
}
