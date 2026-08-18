import {
  type AgentMemoryContext,
  type AgentMemoryScope,
  useMessages,
  useThreads,
} from "@looper/data";
import { useCallback, useEffect, useRef, useState } from "react";

export function useMobileAgent(initialMeetingId?: string) {
  const threads = useThreads();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [scope, setScope] = useState<AgentMemoryScope>(initialMeetingId ? "meetings" : "all");
  const [error, setError] = useState<string | null>(null);
  const creating = useRef(false);
  const messages = useMessages(threadId);

  useEffect(() => {
    if (threadId || threads.isLoading || creating.current) return;
    const existing = threads.threads[0]?._id;
    if (existing) {
      setThreadId(existing);
      return;
    }
    creating.current = true;
    void threads
      .create("Ask Looper")
      .then(setThreadId)
      .catch(() => setError("No se pudo abrir una conversación privada."))
      .finally(() => {
        creating.current = false;
      });
  }, [threadId, threads]);

  const send = useCallback(
    async (content: string) => {
      const value = content.trim();
      if (!value || !threadId) return;
      setError(null);
      const context: AgentMemoryContext = {
        scope,
        ...(initialMeetingId ? { meetingId: initialMeetingId } : {}),
      };
      try {
        await messages.send(value, context);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo enviar la pregunta.");
      }
    },
    [initialMeetingId, messages, scope, threadId],
  );

  return {
    threadId,
    scope,
    setScope,
    messages: messages.messages,
    isLoading: threads.isLoading || !threadId || messages.isLoading,
    isBusy: messages.messages.some(
      (message) => message.role === "assistant" && message.status === "streaming",
    ),
    error,
    send,
    stop: messages.stop,
  };
}
