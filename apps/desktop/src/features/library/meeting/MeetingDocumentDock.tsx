import { useLingui } from "@lingui/react/macro";
import { ArrowUp, Pause, Play, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";

import { useMeetingAiStatus } from "../../settings/models/local-llm-queries";
import { useAskMeeting } from "../queries";
import { formatDuration } from "../shared/library-utils";

export type MeetingDocumentDockProps = {
  id: string;
  audioReady: boolean;
  audioError: string | null;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  audioCurrentTime: number;
  audioDuration: number;
  scrubberPercent: number;
};

const WAVEFORM_HEIGHTS = [
  12, 18, 27, 34, 24, 38, 29, 42, 31, 22, 36, 26, 40, 28, 34, 20, 30, 16,
];

type MeetingAudioSourceState = "loading" | "retained" | "unavailable";

function getMeetingAudioSourceState({
  audioReady,
  audioError,
  isPlaying,
}: Pick<
  MeetingDocumentDockProps,
  "audioReady" | "audioError" | "isPlaying"
>): MeetingAudioSourceState {
  if (audioError) return "unavailable";
  if (audioReady || isPlaying) return "retained";
  return "loading";
}

export function MeetingAudioSource({
  audioReady,
  audioError,
  isPlaying,
  onTogglePlayback,
  audioCurrentTime,
  audioDuration,
}: Omit<MeetingDocumentDockProps, "id">) {
  const { t } = useLingui();
  const sourceState = getMeetingAudioSourceState({
    audioReady,
    audioError,
    isPlaying,
  });
  const audioUnavailable = sourceState !== "retained";
  const sourceStatus = {
    loading: {
      label: t({
        id: "meeting.detail.source_loading",
        message: "Loading source…",
      }),
      tone: "text-content-muted",
      dot: "bg-content-disabled animate-pulse motion-reduce:animate-none",
    },
    retained: {
      label: t({
        id: "meeting.detail.source_retained",
        message: "Source retained",
      }),
      tone: "text-[var(--color-toggle-on)]",
      dot: "bg-[var(--color-toggle-on)]",
    },
    unavailable: {
      label: t({
        id: "meeting.detail.source_unavailable",
        message: "Source unavailable",
      }),
      tone: "ui-color-error-soft",
      dot: "bg-[var(--color-error)]",
    },
  }[sourceState];

  return (
    <section
      data-ui-dock="meeting-source"
      className="grid grid-cols-[44px_minmax(130px,1fr)_minmax(150px,260px)_auto] items-center gap-x-4 gap-y-2 rounded-[18px] bg-[color-mix(in_srgb,var(--color-toggle-on)_24%,var(--color-bg-secondary))] px-4 py-3.5"
      aria-label="Original audio"
    >
      <button
        type="button"
        onClick={onTogglePlayback}
        disabled={audioUnavailable}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-content-primary text-surface-primary transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        aria-label={
          isPlaying
            ? t({ id: "library.modal.pause_audio", message: "Pause audio" })
            : t({ id: "library.modal.play_audio", message: "Play audio" })
        }
      >
        {isPlaying ? (
          <Pause size={15} weight="fill" />
        ) : (
          <Play size={15} weight="fill" className="translate-x-px" />
        )}
      </button>

      <div className="min-w-0">
        <p className="ui-text-body-sm-strong text-content-primary">
          Original audio
        </p>
        <p className="mt-0.5 ui-text-micro tabular-nums text-content-secondary">
          {formatDuration(audioDuration)} · recorded locally
        </p>
      </div>

      <div
        className="hidden min-w-0 items-center justify-end gap-1.5 md:flex"
        aria-hidden="true"
      >
        {WAVEFORM_HEIGHTS.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className="w-1 shrink-0 rounded-full bg-[var(--color-toggle-on)]/70"
            style={{ height }}
          />
        ))}
      </div>

      <div
        role="status"
        aria-live="polite"
        data-state={sourceState}
        className={`flex items-center gap-1.5 whitespace-nowrap ui-text-micro font-medium ${sourceStatus.tone}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${sourceStatus.dot}`}
          aria-hidden="true"
        />
        {sourceStatus.label}
      </div>
      <span className="sr-only">
        {formatDuration(audioCurrentTime)} elapsed
      </span>
    </section>
  );
}

export function MeetingQuestionComposer({
  id,
}: Pick<MeetingDocumentDockProps, "id">) {
  const { t } = useLingui();
  const askMeeting = useAskMeeting();
  const { data: meetingAiStatus } = useMeetingAiStatus();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const meetingAiReady = meetingAiStatus?.state === "ready";

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
    <section className="max-w-3xl border-t border-border-primary pt-3">
      {answer || askMeeting.isPending ? (
        <div
          className="mb-2 rounded-xl border border-[color-mix(in_srgb,var(--color-toggle-on)_32%,transparent)] bg-surface-elevated px-4 py-3"
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

      <div className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-secondary px-3 focus-within:ring-2 focus-within:ring-[var(--color-toggle-on)]/35">
        <label className="min-w-0 flex-1">
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
                    message: "Ask this note…",
                  })
                : t({
                    id: "meeting.detail.ai_unavailable",
                    message: "Meeting intelligence unavailable",
                  })
            }
            className="w-full bg-transparent ui-text-body-sm text-content-primary outline-none placeholder:text-content-disabled disabled:cursor-not-allowed"
            aria-label={t({
              id: "meeting.detail.ask_placeholder",
              message: "Ask this note…",
            })}
          />
        </label>
        <button
          type="button"
          onClick={submitQuestion}
          disabled={!meetingAiReady || !question.trim() || askMeeting.isPending}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-toggle-on)] text-surface-primary transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toggle-on)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
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
      <p className="mt-1.5 pl-1 ui-text-nano text-content-disabled">
        {t({
          id: "meeting.detail.ask_scope",
          message: "Answers are generated from this recording.",
        })}
      </p>
      {askMeeting.error ? (
        <p className="mt-1 ui-text-micro ui-color-error-tint">
          {String(askMeeting.error)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Kept as a composed export for direct consumers and tests. The document
 * workspace uses the source card and composer separately to place them beside
 * the content they act on.
 */
export function MeetingDocumentDock(props: MeetingDocumentDockProps) {
  return (
    <div data-ui-dock="meeting-document">
      <MeetingAudioSource {...props} />
      <MeetingQuestionComposer id={props.id} />
    </div>
  );
}
