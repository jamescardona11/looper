import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowUp, Sparkle } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { useMeetingAiStatus } from "../../settings/models/local-llm-queries";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";
import type { MeetingDetails, TranscriptSegment } from "../../../contracts";
import { getMeetingDetails } from "../../../data/library";
import {
  useAskMeeting,
  useGenerateMeetingSummary,
  useMeetingDetails,
  useUpdateMeetingNotes,
} from "../queries";
import CapturedMeetingNotes from "./CapturedMeetingNotes";

const MeetingNotesEditor = ({
  id,
  details,
}: {
  id: string;
  details: MeetingDetails;
}) => {
  const { t } = useLingui();
  const updateNotes = useUpdateMeetingNotes();
  const [notes, setNotes] = useState(details.notes);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savedNotes = useRef(details.notes);
  const latestNotes = useRef(details.notes);
  const revision = useRef(details.notes_revision);
  const mounted = useRef(true);
  const pendingSaves = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (details.notes_revision <= revision.current) return;
    const draftWasPristine = latestNotes.current === savedNotes.current;
    savedNotes.current = details.notes;
    revision.current = details.notes_revision;
    if (draftWasPristine && latestNotes.current !== details.notes) {
      latestNotes.current = details.notes;
      setNotes(details.notes);
    }
  }, [details.notes, details.notes_revision]);

  const queueNotesSave = (notesToSave: string) => {
    saveChain.current = saveChain.current.then(async () => {
      if (notesToSave === savedNotes.current) return;
      pendingSaves.current += 1;
      if (mounted.current) {
        setIsSaving(true);
        setSaveError(null);
      }

      try {
        let updated: MeetingDetails;
        try {
          updated = await updateNotes.mutateAsync({
            id,
            update: {
              notes: notesToSave,
              expected_revision: revision.current,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.includes("Meeting notes changed in another view")) {
            throw error;
          }
          const refreshed = await getMeetingDetails(id);
          savedNotes.current = refreshed.notes;
          revision.current = refreshed.notes_revision;
          if (notesToSave === refreshed.notes) return;
          updated = await updateNotes.mutateAsync({
            id,
            update: {
              notes: notesToSave,
              expected_revision: revision.current,
            },
          });
        }

        savedNotes.current = updated.notes;
        revision.current = updated.notes_revision;
        if (mounted.current) setSaveError(null);
      } catch (error) {
        if (mounted.current) {
          setSaveError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        pendingSaves.current -= 1;
        if (mounted.current && pendingSaves.current === 0) setIsSaving(false);
      }
    });
  };
  const queueNotesSaveRef = useRef(queueNotesSave);
  useEffect(() => {
    queueNotesSaveRef.current = queueNotesSave;
  });

  const clearSaveTimer = () => {
    if (saveTimer.current == null) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
  };

  useMountEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearSaveTimer();
      if (latestNotes.current !== savedNotes.current) {
        queueNotesSaveRef.current(latestNotes.current);
      }
    };
  });

  return (
    <div className="flex h-full w-full flex-col py-6">
      <textarea
        value={notes}
        onChange={(event) => {
          const nextNotes = event.target.value;
          latestNotes.current = nextNotes;
          setNotes(nextNotes);
          setSaveError(null);
          clearSaveTimer();
          saveTimer.current = window.setTimeout(
            () => queueNotesSaveRef.current(nextNotes),
            600,
          );
        }}
        onBlur={() => {
          clearSaveTimer();
          queueNotesSave(latestNotes.current);
        }}
        placeholder={t({
          id: "meeting.detail.notes_placeholder",
          message: "Write notes, decisions, and follow-ups while you listen...",
        })}
        className="min-h-72 flex-1 w-full resize-none border-l-2 border-transparent bg-transparent px-3 py-1 ui-text-body-lg text-content-secondary leading-relaxed outline-none transition-colors placeholder:text-content-disabled focus:border-[var(--color-toggle-on)] custom-scrollbar"
      />
      <div className="mt-3 flex min-h-4 items-center justify-between px-3 ui-text-micro text-content-disabled">
        <span>
          {details.recovered
            ? t({
                id: "meeting.detail.recovered",
                message: "Recovered after interruption",
              })
            : ""}
        </span>
        {saveError ? (
          <span className="flex items-center gap-2 ui-color-error-tint">
            <span>{saveError}</span>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => queueNotesSave(latestNotes.current)}
            >
              {t({ id: "meeting.detail.retry_notes", message: "Retry save" })}
            </button>
          </span>
        ) : (
          <span>
            {isSaving || updateNotes.isPending
              ? t({ id: "meeting.detail.saving_notes", message: "Saving..." })
              : t({
                  id: "meeting.detail.notes_saved",
                  message: "Notes saved locally",
                })}
          </span>
        )}
      </div>
    </div>
  );
};

const MeetingDetail = ({
  id,
  view,
  segments,
  audioAvailable,
  onPlayNote,
}: {
  id: string;
  view: "notes" | "summary" | "moments" | "ask";
  segments: TranscriptSegment[] | null | undefined;
  audioAvailable: boolean;
  onPlayNote: (startMs: number) => void;
}) => {
  const { t } = useLingui();
  const { data: details, isLoading } = useMeetingDetails(id);
  const generateSummary = useGenerateMeetingSummary();
  const askMeeting = useAskMeeting();
  const { data: meetingAiStatus } = useMeetingAiStatus();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  if (isLoading || !details) {
    return (
      <div className="flex h-full items-center justify-center ui-text-meta text-content-muted">
        {t({ id: "meeting.detail.loading", message: "Loading..." })}
      </div>
    );
  }

  if (view === "notes") {
    return <MeetingNotesEditor id={id} details={details} />;
  }

  if (view === "moments") {
    return (
      <div className="h-full overflow-y-auto py-6 custom-scrollbar">
        {details.note_markers.length > 0 ? (
          <CapturedMeetingNotes
            markers={details.note_markers}
            segments={segments}
            liveTranscript={details.live_transcript}
            audioAvailable={audioAvailable}
            onPlay={onPlayNote}
          />
        ) : (
          <p className="border-l-2 border-border-secondary px-4 py-2 ui-text-body-sm text-content-muted">
            {t({
              id: "meeting.detail.no_moments",
              message:
                "Moments are clips you mark while recording. Hold Fn to save the preceding audio; each moment appears here with a playable timestamp.",
            })}
          </p>
        )}
      </div>
    );
  }

  if (view === "ask") {
    const meetingAiReady = meetingAiStatus?.state === "ready";
    const submitQuestion = () => {
      const trimmed = question.trim();
      if (!trimmed || askMeeting.isPending) return;
      askMeeting.mutate({ id, question: trimmed }, { onSuccess: setAnswer });
    };
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-2 py-3">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-primary bg-surface-secondary px-4 py-4 custom-scrollbar">
          {answer ? (
            <div>
              <p className="mb-3 ui-text-micro ui-color-muted">
                {t({
                  id: "meeting.detail.generated_provenance",
                  message: "Generated on this Mac · review before sharing",
                })}
              </p>
              <div className="prose prose-invert max-w-none ui-text-body text-content-secondary prose-headings:text-content-primary prose-li:my-1">
                <ReactMarkdown>{answer}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-content-muted">
              <Sparkle size={22} className="text-content-disabled" />
              <p className="mt-3 max-w-md ui-text-body-sm">
                {meetingAiReady
                  ? t({
                      id: "meeting.detail.ask_help",
                      message:
                        "Ask about decisions, owners, dates, or anything said in this recording. Answers cite the relevant timestamps.",
                    })
                  : (meetingAiStatus?.actionableMessage ??
                    "Meeting intelligence is not ready.")}
              </p>
            </div>
          )}
        </div>
        {askMeeting.error ? (
          <p className="mt-2 ui-text-micro ui-color-error-tint">
            {String(askMeeting.error)}
          </p>
        ) : null}
        <div className="mt-3 flex items-end gap-2 rounded-xl border border-border-primary bg-surface-secondary p-2 focus-within:border-border-hover">
          <textarea
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitQuestion();
              }
            }}
            placeholder={t({
              id: "meeting.detail.ask_placeholder",
              message: "Ask this recording…",
            })}
            disabled={!meetingAiReady}
            className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 ui-text-body-sm text-content-primary outline-none placeholder:text-content-disabled"
          />
          <button
            type="button"
            onClick={submitQuestion}
            disabled={
              !meetingAiReady || !question.trim() || askMeeting.isPending
            }
            aria-label={t({
              id: "meeting.detail.ask_submit",
              message: "Ask recording",
            })}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-content-primary text-surface-primary hover:opacity-90 disabled:opacity-35"
          >
            {askMeeting.isPending ? (
              <Sparkle size={14} className="animate-pulse" />
            ) : (
              <ArrowUp size={15} weight="bold" />
            )}
          </button>
        </div>
      </div>
    );
  }

  const canGenerate = details.ended_at != null;
  const meetingAiReady = meetingAiStatus?.state === "ready";
  return (
    <div className="h-full w-full overflow-y-auto py-6 custom-scrollbar">
      {details.summary_status === "running" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-content-muted">
          <Sparkle size={20} className="animate-pulse" />
          <span className="ui-text-body-sm">
            {t({
              id: "meeting.detail.generating_summary",
              message: "Generating summary...",
            })}
          </span>
        </div>
      ) : details.summary ? (
        <div>
          <div className="mb-7 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-toggle-on)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-toggle-on)_9%,transparent)] px-3 py-2.5 text-[var(--color-toggle-on)]">
            <Sparkle size={13} />
            <p className="ui-text-micro">
              {t({
                id: "meeting.detail.generated_provenance",
                message: "Generated on this Mac · review before sharing",
              })}
            </p>
          </div>
          <div className="prose prose-invert max-w-none ui-text-body-lg text-content-secondary prose-headings:mb-2 prose-headings:mt-7 prose-headings:text-content-primary prose-headings:ui-text-title-strong prose-p:leading-relaxed prose-li:my-1.5 prose-li:leading-relaxed">
            <ReactMarkdown>{details.summary}</ReactMarkdown>
          </div>
          {details.note_markers.length > 0 ? (
            <section className="mt-8 border-t border-border-primary pt-6">
              <h2 className="mb-3 ui-text-title-strong text-content-primary">
                {t({ id: "meeting.detail.moments", message: "Moments" })}
              </h2>
              <CapturedMeetingNotes
                markers={details.note_markers}
                segments={segments}
                liveTranscript={details.live_transcript}
                audioAvailable={audioAvailable}
                onPlay={onPlayNote}
              />
            </section>
          ) : null}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <Sparkle size={22} className="text-content-disabled" />
          <p className="mt-3 ui-text-body-sm text-content-secondary">
            {(generateSummary.error
              ? String(generateSummary.error)
              : details.summary_error) ??
              meetingAiStatus?.actionableMessage ??
              t({
                id: "meeting.detail.no_summary",
                message: "Generate a structured summary from the transcript.",
              })}
          </p>
          <button
            type="button"
            onClick={() => generateSummary.mutate(id)}
            disabled={
              !canGenerate || !meetingAiReady || generateSummary.isPending
            }
            className="mt-4 flex items-center gap-2 rounded-lg border border-border-secondary bg-surface-secondary px-3 py-1.5 ui-text-body-sm text-content-primary hover:bg-surface-elevated disabled:opacity-50"
          >
            {details.summary_error ? (
              <ArrowClockwise size={13} />
            ) : (
              <Sparkle size={13} />
            )}
            {details.summary_error
              ? t({
                  id: "meeting.detail.retry_summary",
                  message: "Retry summary",
                })
              : t({
                  id: "meeting.detail.generate_summary",
                  message: "Generate summary",
                })}
          </button>
        </div>
      )}
    </div>
  );
};

export default MeetingDetail;
