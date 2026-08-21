import { useLingui } from "@lingui/react/macro";
import {
  MagnifyingGlass as Search,
  Plus,
  VideoCamera,
  YoutubeLogo,
} from "@phosphor-icons/react";

import DotMatrix from "../../../shared/ui/DotMatrix";
import ScreenHeader from "../../../shared/ui/ScreenHeader";
import type { LibraryStatusChoice } from "./library-view-model";

type LibraryViewToolbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  status: "all" | LibraryStatusChoice;
  onStatusChange: (choice: LibraryStatusChoice) => void;
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
  const statusOptions: Array<{ value: LibraryStatusChoice; label: string }> = [
    {
      value: "active",
      label: t({
        id: "library.filter.transcribing",
        message: "Transcribing",
      }),
    },
    {
      value: "complete",
      label: t({ id: "library.filter.ready", message: "Ready" }),
    },
    {
      value: "error",
      label: t({
        id: "library.filter.needs_attention",
        message: "Needs attention",
      }),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 pt-8 pb-4 px-0 text-left">
      <div className="flex flex-col gap-4 mb-4 mt-2 md:-mt-6">
        <ScreenHeader
          icon={
            <DotMatrix
              rows={2}
              cols={3}
              activeDots={[0, 1, 2, 4]}
              dotSize={3}
              gap={3}
              color="var(--color-section-marker-alt)"
            />
          }
          title={t({
            id: "library.view.title",
            message: "Everything you recorded",
          })}
          description={t({
            id: "library.view.description",
            message:
              "Meetings, imported audio and YouTube transcripts, in the order they happened.",
          })}
        />

        <div className="grid grid-cols-1 gap-3 rounded-[18px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] p-3 text-[var(--ui-capture-fg)] [box-shadow:var(--ui-pill-shell-shadow)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center xl:grid-cols-[auto_minmax(14rem,1fr)_auto]">
          <div className="flex flex-wrap items-center gap-2 lg:col-span-2 xl:col-span-1">
            <button
              onClick={props.onOpenMeeting}
              disabled={props.meetingDisabled}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-content-primary px-3 py-1.5 ui-text-body-sm font-medium text-surface-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <VideoCamera size={14} />
              {t({ id: "meeting.start.title", message: "Record meeting" })}
            </button>
            <button
              onClick={props.onOpenImport}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-surface)] px-3 py-1.5 ui-text-body-sm ui-color-primary hover:border-[var(--color-border-secondary)] hover:bg-[var(--color-bg-overlay)] transition-colors"
            >
              <Plus size={14} />
              {t({
                id: "library.view.import_button",
                message: "Transcribe file",
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
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-surface)] px-3 py-1.5 ui-text-body-sm ui-color-primary hover:border-[var(--color-border-secondary)] hover:bg-[var(--color-bg-overlay)] transition-colors disabled:opacity-50"
            >
              <YoutubeLogo size={14} />
              {t({ id: "library.youtube.add", message: "YouTube URL" })}
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
                message: "Search meetings, tags...",
              })}
              value={props.searchQuery}
              onChange={(event) => props.onSearchChange(event.target.value)}
              className="w-full bg-[var(--color-bg-surface)] border border-[var(--color-border-primary)] rounded-lg focus:border-[var(--color-border-hover)] pl-9 pr-4 py-1.5 ui-text-input ui-color-primary placeholder-[var(--color-text-muted)] outline-none transition-[border-color,background-color,color] duration-100 ease-out"
            />
          </div>

          <div
            role="group"
            aria-label={t({
              id: "library.filter.aria_label",
              message: "Filter library by status",
            })}
            className="flex flex-wrap items-center gap-1.5 lg:justify-end"
          >
            {statusOptions.map((option) => {
              const active = props.status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => props.onStatusChange(option.value)}
                  className={`rounded-full border px-2.5 py-1 ui-text-label transition-colors ${
                    active
                      ? "border-border-hover bg-accent-10 ui-color-primary"
                      : "border-border-primary bg-surface-surface ui-color-muted hover:border-border-secondary hover:ui-color-secondary"
                  }`}
                >
                  {option.label}
                  {active ? (
                    <span className="ml-1" aria-hidden="true">
                      ×
                    </span>
                  ) : null}
                </button>
              );
            })}
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
