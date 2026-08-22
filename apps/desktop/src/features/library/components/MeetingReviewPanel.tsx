import { useLingui } from "@lingui/react/macro";
import {
  CalendarBlank,
  Cpu,
  Sparkle,
  Tag,
  UsersThree,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { TranscriptSegment } from "../../../types";
import { formatDuration } from "./library-utils";
import MeetingDetail from "./MeetingDetail";

export type MeetingReviewView = "notes" | "enhanced" | "transcript" | "moments";

type MeetingReviewPanelProps = {
  id: string;
  title: string;
  createdAtLabel: string | null;
  durationSeconds: number;
  modelLabel: string;
  tags: string[];
  speakerCount: number;
  view: MeetingReviewView;
  onViewChange: (view: MeetingReviewView) => void;
  segments?: TranscriptSegment[] | null;
  audioAvailable: boolean;
  onPlayNote: (timestampMs: number) => void;
  transcriptPanel: ReactNode;
};

export const MeetingReviewPanel = ({
  id,
  title,
  createdAtLabel,
  durationSeconds,
  modelLabel,
  tags,
  speakerCount,
  view,
  onViewChange,
  segments,
  audioAvailable,
  onPlayNote,
  transcriptPanel,
}: MeetingReviewPanelProps) => {
  const { t } = useLingui();
  const tabs: Array<{ view: MeetingReviewView; label: string }> = [
    {
      view: "notes",
      label: t({ id: "meeting.detail.note", message: "Note" }),
    },
    {
      view: "moments",
      label: t({ id: "meeting.detail.moments", message: "Moments" }),
    },
    {
      view: "transcript",
      label: t({ id: "meeting.detail.transcript", message: "Transcript" }),
    },
  ];

  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto px-6 pb-36 pt-9 custom-scrollbar"
      aria-label={t({
        id: "meeting.detail.document",
        message: "Recording document",
      })}
    >
      <article
        className={`mx-auto flex min-h-full w-full flex-col ${
          view === "transcript" ? "max-w-5xl" : "max-w-3xl"
        }`}
        data-layout={view === "transcript" ? "conversation" : "document"}
      >
        <header className="shrink-0">
          <h1 className="ui-text-display text-content-primary">{title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 ui-text-micro text-content-muted">
            {createdAtLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarBlank size={12} />
                {createdAtLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              {formatDuration(durationSeconds)}
            </span>
            {speakerCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <UsersThree size={12} />
                {speakerCount}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Cpu size={12} />
              {modelLabel}
            </span>
            {tags.slice(0, 2).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1.5">
                <Tag size={12} />
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-7 flex items-center justify-between gap-3 border-b border-border-primary">
          <nav
            role="tablist"
            className="flex min-w-0 items-center gap-1"
            aria-label={t({
              id: "meeting.detail.document_modes",
              message: "Recording document modes",
            })}
          >
            {tabs.map((tab) => (
              <button
                key={tab.view}
                type="button"
                role="tab"
                id={`meeting-document-tab-${tab.view}`}
                aria-selected={view === tab.view}
                aria-controls="meeting-document-panel"
                onClick={() => onViewChange(tab.view)}
                className={`relative inline-flex h-10 items-center gap-2 px-3 ui-text-body-sm-strong outline-none transition-colors duration-150 motion-reduce:transition-none ${
                  view === tab.view
                    ? "text-content-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--color-accent)]"
                    : "text-content-muted hover:text-content-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <button
            id="meeting-document-summary"
            type="button"
            aria-pressed={view === "enhanced"}
            onClick={() => onViewChange("enhanced")}
            className="mb-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-secondary bg-surface-secondary px-2.5 ui-text-body-sm text-content-secondary transition-colors hover:border-border-hover hover:bg-surface-elevated hover:text-content-primary"
          >
            <Sparkle size={13} />
            {t({ id: "meeting.detail.summarize", message: "Summarize" })}
          </button>
        </div>

        <section
          key={view}
          id="meeting-document-panel"
          role="tabpanel"
          aria-labelledby={
            view === "enhanced"
              ? "meeting-document-summary"
              : `meeting-document-tab-${view}`
          }
          className="meeting-panel-enter mt-4 flex min-h-[420px] flex-1 flex-col overflow-hidden"
        >
          {view === "transcript" ? (
            transcriptPanel
          ) : (
            <MeetingDetail
              id={id}
              view={view === "enhanced" ? "summary" : view}
              segments={segments}
              audioAvailable={audioAvailable}
              onPlayNote={onPlayNote}
            />
          )}
        </section>
      </article>
    </main>
  );
};
