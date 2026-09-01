import { useLingui } from "@lingui/react/macro";
import { ArrowUp, CaretDown, Sparkle, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { MeetingTranscriptSegment } from "../../../contracts";
import { useMeetingAiStatus } from "../../settings/models/local-llm-queries";
import { useAskMeeting } from "../queries";
import { groupMeetingTranscriptSegments } from "./meeting-transcript";

/**
 * Una pregunta se ancla al punto del hilo donde se hizo, así que el panel se
 * lee como una conversación: lo que se dijo, lo que preguntaste ahí, y lo que
 * siguió diciéndose. `anchor` es cuántos bloques había en ese momento.
 */
type TranscriptExchange = {
  id: string;
  question: string;
  answer: string;
  failed: boolean;
  anchor: number;
};

export function MeetingTranscriptPanel({
  id,
  meetingId,
  segments,
  pinned,
  onMinimize,
}: {
  id?: string;
  meetingId: string;
  segments: MeetingTranscriptSegment[];
  pinned: boolean;
  onMinimize?: () => void;
}) {
  const { t } = useLingui();
  const askMeeting = useAskMeeting();
  const { data: meetingAiStatus } = useMeetingAiStatus(pinned);
  const shouldAutoScrollRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingId = useRef<string | null>(null);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<TranscriptExchange[]>([]);
  const groups = groupMeetingTranscriptSegments(segments);
  const canAsk = pinned && meetingAiStatus?.state === "ready";

  const updateExchange = (id: string, patch: Partial<TranscriptExchange>) =>
    setExchanges((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );

  const submitQuestion = (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || !meetingId || askMeeting.isPending) return;

    const id = `${Date.now()}-${exchanges.length}`;
    pendingId.current = id;
    shouldAutoScrollRef.current = true;
    setExchanges((current) => [
      ...current,
      {
        id,
        question: trimmed,
        answer: "",
        failed: false,
        anchor: groups.length,
      },
    ]);
    setQuestion("");
    askMeeting.mutate(
      { id: meetingId, question: trimmed },
      {
        onSuccess: (nextAnswer) => {
          pendingId.current = null;
          updateExchange(id, { answer: nextAnswer });
        },
        onError: () => {
          pendingId.current = null;
          updateExchange(id, { failed: true });
        },
      },
    );
  };

  const dismissExchange = (id: string) => {
    setExchanges((current) => current.filter((entry) => entry.id !== id));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const renderExchange = (exchange: TranscriptExchange) => {
    const waiting = pendingId.current === exchange.id && askMeeting.isPending;
    return (
      <div key={exchange.id} className="min-w-0">
        <div className="flex items-start justify-end gap-1">
          <p className="max-w-[80%] rounded-[11px_11px_3px_11px] bg-white/10 px-2.5 py-2 text-[12px] leading-4 text-white/90">
            {exchange.question}
          </p>
          {waiting ? null : (
            <button
              type="button"
              onClick={() => dismissExchange(exchange.id)}
              aria-label={t({
                id: "meeting.capture.ask.close",
                message: "Close answer",
              })}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-white/35 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        {waiting ? (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-[11px] border border-white/10 bg-white/5 px-2.5 py-2.5 text-[11px] leading-4 text-white/45">
            <Sparkle size={12} className="animate-pulse" />
            {t({
              id: "meeting.capture.ask.loading",
              message: "Reading this recording…",
            })}
          </div>
        ) : exchange.failed ? (
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
        ) : (
          <div className="mt-2.5 border-l border-emerald-300/70 pl-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold leading-3 text-emerald-200/90">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {t({
                id: "meeting.capture.ask.context",
                message: "From this recording",
              })}
            </div>
            <div className="prose prose-invert max-w-none text-[13px] leading-[18px] text-white/90 prose-p:my-0 prose-p:leading-[18px] prose-li:my-0 prose-ul:my-1.5 prose-ol:my-1.5">
              <ReactMarkdown>{exchange.answer}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  };

  // El hilo se arma intercalando: los intercambios anclados en `index` van justo
  // antes del bloque que aún no existía cuando se preguntó.
  const feed = [];
  for (let index = 0; index <= groups.length; index += 1) {
    for (const exchange of exchanges.filter(
      (entry) => entry.anchor === index,
    )) {
      feed.push(renderExchange(exchange));
    }
    const group = groups[index];
    if (!group) continue;
    feed.push(
      <div key={group.id} className="min-w-0">
        <span className="mb-1 block text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/45">
          {group.source === "you"
            ? t({ id: "meeting.transcript.you", message: "You" })
            : t({ id: "meeting.transcript.them", message: "Them" })}
        </span>
        <p className="m-0 whitespace-pre-wrap break-words text-[14px] font-normal leading-5 text-white/90">
          {group.text}
        </p>
      </div>,
    );
  }

  return (
    <section
      id={id}
      aria-label={t({
        id: "meeting.capture.transcript.live",
        message: "Live transcript",
      })}
      className="pointer-events-auto flex h-[300px] w-[320px] flex-col overflow-hidden rounded-[14px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] text-white [box-shadow:none]"
    >
      {onMinimize ? (
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 pl-3.5 pr-1">
          <span className="text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/45">
            {t({
              id: "meeting.capture.transcript.live",
              message: "Live transcript",
            })}
          </span>
          <button
            type="button"
            onClick={onMinimize}
            aria-label={t({
              id: "meeting.capture.transcript.minimize",
              message: "Minimize transcript",
            })}
            className="group grid h-10 w-10 shrink-0 place-items-center text-white/45"
          >
            <span className="grid h-6 w-6 place-items-center rounded-[7px] transition-colors duration-150 group-hover:bg-white/10 group-hover:text-white group-focus-visible:bg-white/10 group-focus-visible:text-white">
              <CaretDown size={13} weight="bold" />
            </span>
          </button>
        </header>
      ) : null}
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
        data-testid="transcript-scroller"
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 custom-scrollbar-thin"
        aria-live="polite"
      >
        {feed.length > 0 ? (
          <div className="flex flex-col gap-4">{feed}</div>
        ) : (
          <p className="flex h-full items-end pb-1 text-[13px] leading-5 text-white/45">
            {t({
              id: "meeting.transcript.waiting",
              message: "Waiting for speech…",
            })}
          </p>
        )}
      </div>

      {canAsk ? (
        <form
          className="shrink-0 border-t border-white/10 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion(question);
          }}
        >
          {exchanges.length === 0 ? (
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
                message: "Ask about this recording",
              })}
              placeholder={t({
                id: "meeting.capture.ask.placeholder",
                message: "Ask about this recording…",
              })}
              className="min-w-0 flex-1 bg-transparent text-[12px] leading-4 text-white outline-none placeholder:text-white/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!question.trim() || askMeeting.isPending}
              aria-label={t({
                id: "meeting.capture.ask.submit",
                message: "Ask recording",
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
