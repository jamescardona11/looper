import { useLingui } from "@lingui/react/macro";
import { ArrowUp, Sparkle, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { MeetingTranscriptSegment } from "../../../types";
import { useMeetingAiStatus } from "../../settings/local-llm-queries";
import { useAskMeeting } from "../queries";
import { groupMeetingTranscriptSegments } from "./meeting-transcript";

export function MeetingTranscriptPanel({
  meetingId,
  segments,
  pinned,
}: {
  meetingId: string;
  segments: MeetingTranscriptSegment[];
  pinned: boolean;
}) {
  const { t } = useLingui();
  const askMeeting = useAskMeeting();
  const { data: meetingAiStatus } = useMeetingAiStatus(pinned);
  const shouldAutoScrollRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const groups = groupMeetingTranscriptSegments(segments);
  const canAsk = pinned && meetingAiStatus?.state === "ready";

  const submitQuestion = (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || !meetingId || askMeeting.isPending) return;

    shouldAutoScrollRef.current = true;
    setSubmittedQuestion(trimmed);
    setAnswer("");
    askMeeting.mutate(
      { id: meetingId, question: trimmed },
      {
        onSuccess: (nextAnswer) => {
          setAnswer(nextAnswer);
          setQuestion("");
        },
      },
    );
  };

  const clearAnswer = () => {
    setSubmittedQuestion("");
    setAnswer("");
    askMeeting.reset();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <section
      aria-label={t({
        id: "meeting.capture.transcript.live",
        message: "Meeting live transcript",
      })}
      className={`flex h-[300px] w-[252px] flex-col overflow-hidden rounded-[14px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] text-white [box-shadow:none] ${
        pinned ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        ref={(element) => {
          if (!element || !shouldAutoScrollRef.current) return;
          requestAnimationFrame(() => {
            element.scrollTop = element.scrollHeight;
          });
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldAutoScrollRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            8;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 custom-scrollbar-thin"
        aria-live="polite"
      >
        {groups.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.id} className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase leading-3 tracking-[0.08em] text-white/45">
                  {group.source === "you"
                    ? t({ id: "meeting.transcript.you", message: "You" })
                    : t({ id: "meeting.transcript.them", message: "Them" })}
                </span>
                <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-normal leading-5 text-white/90">
                  {group.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex h-full items-end pb-1 text-[13px] leading-5 text-white/45">
            {t({
              id: "meeting.transcript.waiting",
              message: "Waiting for meeting speech…",
            })}
          </p>
        )}

        {submittedQuestion ? (
          <div className="mt-4">
            <div className="flex items-start justify-end gap-1">
              <p className="max-w-[188px] rounded-[11px_11px_3px_11px] bg-white/10 px-2.5 py-2 text-[12px] leading-4 text-white/90">
                {submittedQuestion}
              </p>
              {answer ? (
                <button
                  type="button"
                  onClick={clearAnswer}
                  aria-label={t({
                    id: "meeting.capture.ask.close",
                    message: "Close answer",
                  })}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-white/35 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                >
                  <X size={12} weight="bold" />
                </button>
              ) : null}
            </div>

            {askMeeting.isPending ? (
              <div className="mt-2.5 flex items-center gap-1.5 rounded-[11px] border border-white/10 bg-white/5 px-2.5 py-2.5 text-[11px] leading-4 text-white/45">
                <Sparkle size={12} className="animate-pulse" />
                {t({
                  id: "meeting.capture.ask.loading",
                  message: "Reading this meeting…",
                })}
              </div>
            ) : answer ? (
              <div className="mt-2.5 border-l border-emerald-300/70 pl-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold leading-3 text-emerald-200/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {t({
                    id: "meeting.capture.ask.context",
                    message: "From this meeting",
                  })}
                </div>
                <div className="prose prose-invert max-w-none text-[13px] leading-[18px] text-white/90 prose-p:my-0 prose-p:leading-[18px] prose-li:my-0 prose-ul:my-1.5 prose-ol:my-1.5">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                </div>
              </div>
            ) : askMeeting.error ? (
              <div
                role="alert"
                className="mt-2.5 rounded-[11px] border border-red-300/15 bg-red-300/5 px-2.5 py-2.5"
              >
                <p className="text-[11px] font-semibold leading-4 text-red-200/90">
                  {t({
                    id: "meeting.capture.ask.error_title",
                    message: "Couldn’t answer",
                  })}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-white/45">
                  {t({
                    id: "meeting.capture.ask.error_help",
                    message: "Your transcript is safe. Try again in a moment.",
                  })}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {canAsk ? (
        <form
          className="shrink-0 border-t border-white/10 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion(question);
          }}
        >
          {!submittedQuestion ? (
            <button
              type="button"
              onClick={() => submitQuestion("What did I miss?")}
              className="mb-1.5 inline-flex h-[26px] items-center rounded-[9px] border border-white/10 px-2 text-[10px] font-semibold text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {t({
                id: "meeting.capture.ask.suggestion",
                message: "What did I miss?",
              })}
            </button>
          ) : null}
          <div className="flex min-h-[38px] items-center gap-1 rounded-[12px] border border-white/15 bg-white/5 p-[3px] pl-2.5 focus-within:border-white/35">
            <input
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={askMeeting.isPending}
              aria-label={t({
                id: "meeting.capture.ask.input",
                message: "Ask about this meeting",
              })}
              placeholder={t({
                id: "meeting.capture.ask.placeholder",
                message: "Ask about this meeting…",
              })}
              className="min-w-0 flex-1 bg-transparent text-[12px] leading-4 text-white outline-none placeholder:text-white/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!question.trim() || askMeeting.isPending}
              aria-label={t({
                id: "meeting.capture.ask.submit",
                message: "Ask meeting",
              })}
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-white text-[var(--ui-pill-shell-bg)] transition-colors duration-150 hover:bg-emerald-200 disabled:bg-white/15 disabled:text-white/30"
            >
              {askMeeting.isPending ? (
                <Sparkle size={12} className="animate-pulse" />
              ) : (
                <ArrowUp size={13} weight="bold" />
              )}
            </button>
          </div>
        </form>
      ) : pinned ? (
        <div className="shrink-0 border-t border-white/10 px-3 py-2 text-[10px] leading-4 text-white/45">
          Meeting intelligence ·{" "}
          {meetingAiStatus?.state.replace(/_/g, " ") ?? "checking"}
        </div>
      ) : null}
    </section>
  );
}
