import { useLingui } from "@lingui/react/macro";
import {
  ArrowUp,
  EnvelopeSimple,
  Pause,
  Play,
  Sparkle,
  TextAlignLeft,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useMeetingAiStatus } from "../../settings/local-llm-queries";
import { useAskMeeting } from "../queries";
import { formatDuration } from "./library-utils";

type MeetingDocumentDockProps = {
  id: string;
  audioReady: boolean;
  audioError: string | null;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  audioCurrentTime: number;
  audioDuration: number;
  scrubberPercent: number;
  transcriptOpen: boolean;
  onTranscriptToggle: () => void;
};

export function MeetingDocumentDock({
  id,
  audioReady,
  audioError,
  isPlaying,
  onTogglePlayback,
  audioCurrentTime,
  audioDuration,
  scrubberPercent,
  transcriptOpen,
  onTranscriptToggle,
}: MeetingDocumentDockProps) {
  const { t } = useLingui();
  const askMeeting = useAskMeeting();
  const { data: meetingAiStatus } = useMeetingAiStatus();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const meetingAiReady = meetingAiStatus?.state === "ready";
  const audioUnavailable = !audioReady || Boolean(audioError);

  const submitQuestion = () => {
    const trimmed = question.trim();
    if (!trimmed || !meetingAiReady || askMeeting.isPending) return;
    askMeeting.mutate(
      { id, question: trimmed },
      {
        onSuccess: (nextAnswer) => {
          setAnswer(nextAnswer);
          setQuestion("");
        },
      },
    );
  };

  return (
    <footer
      data-ui-dock="meeting-document"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-5 pb-3 pt-10"
      style={{
        background:
          "linear-gradient(to top, var(--color-bg-tertiary) 34%, transparent)",
      }}
    >
      {answer || askMeeting.isPending ? (
        <div
          className="meeting-answer-enter pointer-events-auto mx-auto mb-2 max-w-3xl rounded-xl border border-[color-mix(in_srgb,var(--color-toggle-on)_32%,transparent)] bg-surface-elevated px-4 py-3 shadow-xl"
          role="status"
        >
          <div className="flex items-center gap-2 ui-text-micro font-medium text-[var(--color-toggle-on)]">
            <Sparkle
              size={13}
              className={askMeeting.isPending ? "animate-pulse" : ""}
            />
            {askMeeting.isPending
              ? t({
                  id: "meeting.detail.ask_thinking",
                  message: "Thinking locally…",
                })
              : t({
                  id: "meeting.detail.ask_answer",
                  message: "Looper answer",
                })}
          </div>
          {answer ? (
            <p className="mt-2 ui-text-body-sm leading-relaxed text-content-secondary">
              {answer}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-auto mx-auto flex min-h-14 max-w-3xl items-center gap-2 rounded-2xl border border-border-hover bg-surface-overlay/95 p-2 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={audioUnavailable}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border-secondary bg-surface-elevated text-content-primary transition-[background-color,transform] duration-150 hover:bg-surface-surface active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          aria-label={
            isPlaying
              ? t({ id: "library.modal.pause_audio", message: "Pause audio" })
              : t({ id: "library.modal.play_audio", message: "Play audio" })
          }
        >
          {isPlaying ? (
            <Pause size={15} weight="fill" />
          ) : (
            <Play size={15} weight="fill" />
          )}
        </button>

        <div className="w-24 shrink-0 px-1">
          <span className="ui-text-micro tabular-nums text-content-muted">
            {formatDuration(audioCurrentTime)} / {formatDuration(audioDuration)}
          </span>
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-border-secondary">
            <div
              className="h-full rounded-full bg-[var(--color-toggle-on)] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${scrubberPercent}%` }}
            />
          </div>
        </div>

        <label className="min-w-0 flex-1 px-1">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitQuestion();
              }
            }}
            disabled={!meetingAiReady}
            placeholder={
              meetingAiReady
                ? t({
                    id: "meeting.detail.ask_placeholder",
                    message: "Ask this recording…",
                  })
                : (meetingAiStatus?.actionableMessage ??
                  t({
                    id: "meeting.detail.ai_unavailable",
                    message: "Meeting intelligence unavailable",
                  }))
            }
            className="w-full bg-transparent ui-text-body-sm text-content-primary outline-none placeholder:text-content-disabled disabled:cursor-not-allowed"
            aria-label={t({
              id: "meeting.detail.ask_placeholder",
              message: "Ask this recording…",
            })}
          />
          <span className="mt-0.5 block ui-text-nano text-content-disabled">
            {t({
              id: "meeting.detail.ask_context",
              message: "Using this recording · private by default",
            })}
          </span>
        </label>

        <button
          type="button"
          onClick={() =>
            setQuestion(
              "Draft a concise follow-up with the decision and owners",
            )
          }
          disabled={!meetingAiReady}
          className="hidden h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-primary px-2.5 ui-text-micro text-content-secondary transition-colors hover:border-border-hover hover:bg-surface-elevated hover:text-content-primary disabled:opacity-40 xl:flex"
        >
          <EnvelopeSimple size={13} />
          {t({
            id: "meeting.detail.draft_follow_up",
            message: "Draft follow-up",
          })}
        </button>

        <button
          type="button"
          onClick={onTranscriptToggle}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${
            transcriptOpen
              ? "border-[color-mix(in_srgb,var(--color-toggle-on)_36%,transparent)] bg-[color-mix(in_srgb,var(--color-toggle-on)_12%,transparent)] text-[var(--color-toggle-on)]"
              : "border-border-primary text-content-muted hover:border-border-hover hover:bg-surface-elevated hover:text-content-primary"
          }`}
          aria-label={t({
            id: "meeting.detail.transcript",
            message: "Transcript",
          })}
          aria-pressed={transcriptOpen}
        >
          <TextAlignLeft size={15} />
        </button>

        <button
          type="button"
          onClick={submitQuestion}
          disabled={!meetingAiReady || !question.trim() || askMeeting.isPending}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-toggle-on)] text-surface-primary transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
          aria-label={t({
            id: "meeting.detail.ask_submit",
            message: "Ask recording",
          })}
        >
          {askMeeting.isPending ? (
            <Sparkle size={14} className="animate-pulse" />
          ) : (
            <ArrowUp size={15} weight="bold" />
          )}
        </button>
      </div>

      {askMeeting.error ? (
        <p className="pointer-events-auto mx-auto mt-1 max-w-3xl text-center ui-text-micro ui-color-error-tint">
          {String(askMeeting.error)}
        </p>
      ) : null}
    </footer>
  );
}
