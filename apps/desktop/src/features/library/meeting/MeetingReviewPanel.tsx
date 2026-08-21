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
import { formatDuration } from "../shared/library-utils";
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
      label: t({ id: "meeting.detail.my_notes", message: "My notes" }),
    },
    {
      view: "enhanced",
      label: t({ id: "meeting.detail.enhanced", message: "Enhanced" }),
    },
    {
      view: "transcript",
      label: t({ id: "meeting.detail.transcript", message: "Transcript" }),
    },
    {
      view: "moments",
      label: t({ id: "meeting.detail.moments", message: "Moments" }),
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
          <div className="mt-3 flex flex-wrap items-center gap-2 ui-text-micro text-content-muted">
            {createdAtLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-primary px-2.5 py-1">
                <CalendarBlank size={12} />
                {createdAtLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-primary px-2.5 py-1">
              {formatDuration(durationSeconds)}
            </span>
            {speakerCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-primary px-2.5 py-1">
                <UsersThree size={12} />
                {speakerCount}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-primary px-2.5 py-1">
              <Cpu size={12} />
              {modelLabel}
            </span>
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-primary px-2.5 py-1"
              >
                <Tag size={12} />
                {tag}
              </span>
            ))}
          </div>
        </header>

        <nav
          role="tablist"
          className="mt-7 inline-flex w-fit max-w-full items-center gap-1 rounded-2xl bg-surface-secondary p-1"
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
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 ui-text-body-sm-strong outline-none transition-colors duration-150 motion-reduce:transition-none ${
                view === tab.view
                  ? "border border-border-hover bg-surface-elevated text-content-primary shadow-sm"
                  : "border border-transparent text-content-muted hover:bg-surface-surface hover:text-content-primary"
              }`}
            >
              {tab.view === "enhanced" ? <Sparkle size={15} /> : null}
              {tab.label}
            </button>
          ))}
        </nav>

        <section
          key={view}
          id="meeting-document-panel"
          role="tabpanel"
          aria-labelledby={`meeting-document-tab-${view}`}
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
