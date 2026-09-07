import { useLingui } from "@lingui/react/macro";
import { ArrowLeft } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { TranscriptSegment } from "../../../contracts";
import { formatDuration } from "../shared/library-utils";
import {
  MeetingAudioSource,
  MeetingQuestionComposer,
  type MeetingDocumentDockProps,
} from "./MeetingDocumentDock";
import { useMeetingDetails } from "../queries";
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
  meetingDockProps?: Omit<MeetingDocumentDockProps, "id">;
  transcriptPanel: ReactNode;
};

export const MeetingReviewPanel = ({
  id,
  title,
  createdAtLabel,
  durationSeconds,
  speakerCount,
  view,
  onViewChange,
  segments,
  audioAvailable,
  onPlayNote,
  meetingDockProps,
  transcriptPanel,
}: MeetingReviewPanelProps) => {
  const { t } = useLingui();
  const { data: meetingDetails } = useMeetingDetails(id);
  const momentCount = meetingDetails?.note_markers.length ?? 0;
  const tabs: Array<{ view: MeetingReviewView; label: string }> = [
    {
      view: "notes",
      label: "Note",
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
      className="min-h-0 flex-1 overflow-hidden pb-5 pt-7"
      aria-label={t({
        id: "meeting.detail.document",
        message: "Recording document",
      })}
    >
      <article
        className="flex h-full w-full max-w-5xl flex-col"
        data-layout={view === "transcript" ? "conversation" : "document"}
      >
        <header className="shrink-0 border-b border-border-primary pb-5">
          <h1 className="ui-text-document-title text-content-primary">
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ui-text-micro text-content-muted">
            {createdAtLabel ? <span>{createdAtLabel}</span> : null}
            {createdAtLabel ? <span aria-hidden="true">·</span> : null}
            <span>{formatDuration(durationSeconds)}</span>
            {speakerCount > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{speakerCount} speakers</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>Local recording</span>
          </div>
        </header>

        {meetingDockProps ? (
          <div className="mt-5">
            <MeetingAudioSource {...meetingDockProps} />
          </div>
        ) : null}

        <nav
          role="tablist"
          className="mt-5 flex w-fit max-w-full items-center gap-1 rounded-2xl bg-surface-secondary p-1"
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
              className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 ui-text-body-sm-strong outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)] motion-reduce:transition-none ${
                view === tab.view
                  ? "bg-content-primary text-surface-primary"
                  : "text-content-muted hover:bg-surface-elevated hover:text-content-primary"
              }`}
            >
              {tab.label}
              {tab.view === "moments" && momentCount > 0 ? (
                <span className="ui-text-label opacity-70">{momentCount}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <section
          key={view}
          id="meeting-document-panel"
          role="tabpanel"
          aria-label={view === "enhanced" ? "Summary" : undefined}
          aria-labelledby={
            view === "enhanced" ? undefined : `meeting-document-tab-${view}`
          }
          className="mt-4 flex min-h-[260px] flex-1 flex-col overflow-y-auto custom-scrollbar"
        >
          {view === "transcript" ? (
            transcriptPanel
          ) : (
            <>
              <MeetingDetail
                id={id}
                view={view === "enhanced" ? "summary" : view}
                segments={segments}
                audioAvailable={audioAvailable}
                onPlayNote={onPlayNote}
              />
              {view === "enhanced" ? (
                <button
                  type="button"
                  onClick={() => onViewChange("notes")}
                  className="mt-3 inline-flex h-9 w-fit items-center gap-1.5 rounded-xl px-3 ui-text-body-sm-strong ui-color-accent outline-none transition-colors hover:bg-[var(--color-accent-10)] focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)]"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  {t({
                    id: "meeting.detail.back_to_note",
                    message: "Back to note",
                  })}
                </button>
              ) : null}
            </>
          )}
        </section>
        {meetingDockProps ? (
          <div className="sticky bottom-0 z-10 shrink-0 bg-surface-primary pt-3">
            <MeetingQuestionComposer id={id} />
          </div>
        ) : null}
      </article>
    </main>
  );
};
