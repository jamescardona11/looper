import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { ChatMessage } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconTool } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/shared/components/eyebrow";
import { MarkdownContent } from "@/shared/components/markdown-content";

interface MessagesTimelineProps {
  messages: ChatMessage[];
  onRegenerate?: () => void | Promise<void>;
  onEdit?: (messageId: string, content: string) => void | Promise<void>;
}

export function MessagesTimeline({ messages, onRegenerate, onEdit }: MessagesTimelineProps) {
  const [listRef] = useAutoAnimate<HTMLDivElement>();
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows — re-runs on every message update,
  // including each streamed token (Convex returns a fresh array each time).
  // Instant tracking while the reply streams, smooth glide for new messages.
  useEffect(() => {
    const last = messages[messages.length - 1];
    endRef.current?.scrollIntoView({
      behavior: last?.status === "streaming" ? "auto" : "smooth",
    });
  }, [messages]);

  return (
    <div
      ref={listRef as React.Ref<HTMLDivElement>}
      className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6"
    >
      {messages.map((m, i) => (
        <MessageRow
          key={m._id}
          message={m}
          isLast={i === messages.length - 1}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function MessageRow({
  message,
  isLast,
  onRegenerate,
  onEdit,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate?: () => void | Promise<void>;
  onEdit?: (messageId: string, content: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex flex-col gap-2",
          isUser ? "max-w-[85%] items-end" : "w-full items-start",
        )}
      >
        {!isUser ? <Eyebrow>{t("agent.assistant")}</Eyebrow> : null}

        {!isUser && message.reasoning ? <ReasoningTrace text={message.reasoning} /> : null}

        {!isUser && message.toolCalls ? <ToolTimeline raw={message.toolCalls as string} /> : null}

        {message.content || message.status === "streaming" ? (
          <div
            className={cn(
              "rounded-2xl text-sm leading-relaxed",
              // Chat-tail: the bubble's near corner is squared off so it reads as
              // a speech bubble anchored to its side, not a floating rounded block.
              // The user bubble hugs its (often short) text; the assistant keeps
              // roomier padding for long-form prose.
              isUser
                ? "rounded-br-md bg-primary px-3.5 py-1.5 text-primary-foreground leading-normal"
                : message.status === "error"
                  ? "rounded-bl-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-foreground"
                  : "w-full px-0.5 py-1 text-foreground",
            )}
          >
            {message.content ? (
              isUser ? (
                <UserMessageBody
                  content={message.content}
                  onEdit={onEdit ? (text) => onEdit(message._id, text) : undefined}
                />
              ) : (
                <MarkdownContent content={message.content} />
              )
            ) : (
              <TypingDots />
            )}
            {message.status === "streaming" && message.content ? (
              <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
            ) : null}
          </div>
        ) : null}

        {!isUser && message.status === "done" && message.content ? (
          <MessageActions
            content={message.content}
            canRegenerate={isLast}
            onRegenerate={onRegenerate}
          />
        ) : null}
      </div>
    </div>
  );
}

// User message body with inline edit → on save, edits the turn and re-runs the assistant.
function UserMessageBody({
  content,
  onEdit,
}: {
  content: string;
  onEdit?: (text: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t("agent.editMessage")}
          rows={3}
          className="w-full resize-none rounded-md bg-primary-foreground/10 p-2 text-primary-foreground text-sm outline-none"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setDraft(content);
              setEditing(false);
            }}
            className="inline-flex h-11 items-center text-[11px] text-primary-foreground/70 hover:text-primary-foreground sm:h-auto"
          >
            {t("agent.cancelEdit")}
          </button>
          <button
            type="button"
            onClick={() => {
              const text = draft.trim();
              setEditing(false);
              if (text && text !== content) void onEdit?.(text);
            }}
            className="inline-flex h-11 items-center font-medium text-[11px] text-primary-foreground sm:h-auto"
          >
            {t("agent.saveResend")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/edit">
      <p className="whitespace-pre-wrap">{content}</p>
      {onEdit ? (
        <button
          type="button"
          onClick={() => {
            setDraft(content);
            setEditing(true);
          }}
          className="mt-1 inline-flex h-11 items-center text-[10px] text-primary-foreground/60 opacity-100 transition-opacity hover:text-primary-foreground sm:h-auto sm:opacity-0 sm:group-hover/edit:opacity-100"
        >
          {t("agent.editMessage")}
        </button>
      ) : null}
    </div>
  );
}

// Actions under an assistant message. Copy grabs the raw markdown; Regenerate
// re-runs the model (only on the latest message).
function MessageActions({
  content,
  canRegenerate,
  onRegenerate,
}: {
  content: string;
  canRegenerate?: boolean;
  onRegenerate?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const action =
    "inline-flex h-11 items-center px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:h-auto";
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            .writeText(content)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined);
        }}
        className={action}
      >
        {copied ? t("agent.copied") : t("agent.copy")}
      </button>
      {canRegenerate && onRegenerate ? (
        <button type="button" onClick={() => void onRegenerate()} className={action}>
          {t("agent.regenerate")}
        </button>
      ) : null}
    </div>
  );
}

// Collapsible "thinking" trace for reasoning models (o3 / o4-mini etc.).
function ReasoningTrace({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <details className="w-full max-w-full rounded-2xl border border-border bg-muted/30 px-3 py-1.5">
      <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">
        {t("agent.thinking")}
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-[11px] text-muted-foreground/80 leading-relaxed">
        {text}
      </div>
    </details>
  );
}

// Renders the tools the assistant called, as small chips above its answer.
function ToolTimeline({ raw }: { raw: string }) {
  let calls: Array<{ name: string }> = [];
  try {
    calls = JSON.parse(raw);
  } catch {
    return null;
  }
  if (calls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((c, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: tool calls have no stable id
          key={`${c.name}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          <IconTool className="size-3" aria-hidden />
          {c.name}
        </span>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
