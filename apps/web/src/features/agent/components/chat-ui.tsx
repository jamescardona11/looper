import { useCredits } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { lazy, Suspense, useState } from "react";
import { reportError } from "@/lib/errors";
import { consumeAgentDraft } from "../draft";
import { useMessages } from "../hooks/use-messages";
import { useSuggestions } from "../hooks/use-suggestions";
import { quotaBlocksSend } from "../quota";
import { ChatComposer } from "./chat-composer";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatLoadingState } from "./chat-loading-state";
import { SuggestedPrompts } from "./suggested-prompts";

const MessagesTimeline = lazy(() =>
  import("./messages-timeline").then((module) => ({ default: module.MessagesTimeline })),
);

interface ChatUIProps {
  threadId: string;
}

export function ChatUI({ threadId }: ChatUIProps) {
  const { t } = useTranslation();
  const [initialDraft] = useState(() => consumeAgentDraft(threadId));
  const { messages, isLoading, send, regenerate, stop, edit } = useMessages(threadId);
  const { balance } = useCredits();
  const [sendError, setSendError] = useState<string | null>(null);
  const busy = messages.some((m) => m.role === "assistant" && m.status === "streaming");
  const suggestions = useSuggestions(messages, t);

  const onSend = async (text: string) => {
    // Quota gate also guards the empty-state prompts and suggested prompts,
    // which call onSend directly (bypassing the composer's disabled button).
    if (quotaBlocksSend(balance?.byok ?? false, balance?.remaining ?? null)) return;
    setSendError(null);
    try {
      await send(text);
    } catch (err) {
      setSendError(reportError(err, t("agent.sendFailed")));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ChatLoadingState />
        ) : messages.length === 0 ? (
          <ChatEmptyState onSelectPrompt={(p) => void onSend(p)} />
        ) : (
          <Suspense fallback={<ChatLoadingState />}>
            <MessagesTimeline messages={messages} onRegenerate={regenerate} onEdit={edit} />
          </Suspense>
        )}
      </div>
      {!busy && messages.length > 0 ? (
        <SuggestedPrompts suggestions={suggestions} onPick={(p) => void onSend(p)} />
      ) : null}
      <ChatComposer
        initialText={initialDraft}
        busy={busy}
        onSend={onSend}
        onStop={stop}
        creditsRemaining={balance?.remaining ?? null}
        creditsLimit={balance?.limit ?? null}
        tier={balance?.tier ?? "free"}
        byok={balance?.byok ?? false}
        error={sendError}
      />
    </div>
  );
}
