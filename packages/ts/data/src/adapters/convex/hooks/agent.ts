// Convex adapter — agent domain hooks.
//
// Implements the recording-assistant domain surface: text messages, private
// threads, thread maintenance, preview, and internal quota state.
//
// Boundary rules enforced here (per the design surface specialCases):
//   - Every threadId / messageId / storageId is a plain `string` in the public
//     signatures; the Convex Id<> / `as any` casts ALL live inside this adapter.
//   - useQuery is called UNCONDITIONALLY. Skip-gated reads pass the "skip"
//     sentinel (never `ref ? useQuery(ref) : null`). Optional features (shared
//     thread, subscription) probe the resolved ref and pass "skip" when absent,
//     exposing defaults (null / "free") instead of returning null from the hook.
//   - Convex's loading sentinel is `undefined` → mapped to isLoading; lists
//     default to [] and scalars/objects to null so `undefined` never leaks.
//   - Platform-specific transport belongs at the app boundary; this adapter
//     only handles private, text-only assistant messages.

import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import type {
  AgentMemoryContext,
  AgentThread,
  ChatMessage,
  CreditsBalance,
  ThreadPreview,
  Tier,
} from "../../../types";
import { SKIP } from "../query-control";
import { usePersistedQuery } from "../persisted-query";

// ── useMessages ─────────────────────────────────────────────────────────────
// Core assistant hook. Voice notes are transcribed by the client before this
// boundary; messages reaching Convex are always private, text-only turns.
export function useMessages(threadId: string | null) {
  const tid = threadId as Id<"agentThreads"> | null;

  const messages = usePersistedQuery(
    "agent.messages.list",
    api.agent.messages.list,
    tid ? { threadId: tid } : SKIP,
  );
  const addUserMessage = useMutation(api.agent.messages.addUserMessage);
  const regenerateLast = useMutation(api.agent.messages.regenerateLast);
  const cancelGeneration = useMutation(api.agent.messages.cancelGeneration);
  const editUserMessage = useMutation(api.agent.messages.editUserMessage);

  const send = useCallback(
    async (content: string, context?: AgentMemoryContext): Promise<void> => {
      if (!tid) return;
      await addUserMessage({
        threadId: tid,
        content,
        ...(context ? { memoryScope: context.scope } : {}),
        ...(context?.meetingId ? { meetingId: context.meetingId } : {}),
      });
    },
    [tid, addUserMessage],
  );

  const regenerate = useCallback((): Promise<void> => {
    if (!tid) return Promise.resolve();
    return regenerateLast({ threadId: tid }).then(() => undefined);
  }, [tid, regenerateLast]);

  const stop = useCallback((): Promise<void> => {
    if (!tid) return Promise.resolve();
    return cancelGeneration({ threadId: tid }).then(() => undefined);
  }, [tid, cancelGeneration]);

  const edit = useCallback(
    (messageId: string, content: string): Promise<void> =>
      editUserMessage({ messageId: messageId as Id<"agentMessages">, content }).then(
        () => undefined,
      ),
    [editUserMessage],
  );

  return {
    messages: (messages ?? []) as ChatMessage[],
    isLoading: messages === undefined,
    send,
    regenerate,
    stop,
    edit,
  };
}

// ── useThreads ───────────────────────────────────────────────────────────────
// Thread list + CRUD. All ids are plain strings at the boundary; the Id<> casts
// live here. create() resolves to the new thread id as a plain string.
export function useThreads(opts: { archived?: boolean; limit?: number } = {}) {
  const threads = useQuery(api.agent.threads.listThreads, opts);
  const createMutation = useMutation(api.agent.threads.createThread);
  const renameMutation = useMutation(api.agent.threads.renameThread);
  const archiveMutation = useMutation(api.agent.threads.archiveThread);
  const deleteMutation = useMutation(api.agent.threads.deleteThread);

  const create = useCallback(
    (title?: string): Promise<string> =>
      createMutation(title ? { title } : {}).then((id) => id as string),
    [createMutation],
  );
  const rename = useCallback(
    (id: string, title: string): Promise<void> =>
      renameMutation({ threadId: id as Id<"agentThreads">, title }).then(() => undefined),
    [renameMutation],
  );
  const archive = useCallback(
    (id: string): Promise<void> =>
      archiveMutation({ threadId: id as Id<"agentThreads"> }).then(() => undefined),
    [archiveMutation],
  );
  const remove = useCallback(
    (id: string): Promise<void> =>
      deleteMutation({ threadId: id as Id<"agentThreads"> }).then(() => undefined),
    [deleteMutation],
  );

  return {
    threads: (threads ?? []) as AgentThread[],
    isLoading: threads === undefined,
    create,
    rename,
    archive,
    remove,
  };
}

// ── useThreadMaintenance ────────────────────────────────────────────────────
// Keeps abandoned empty threads out of the private assistant history.
export function useThreadMaintenance() {
  const pruneEmptyThreads = useMutation(api.agent.threads.pruneEmptyThreads);

  const pruneEmpty = useCallback(
    (keepThreadId: string): Promise<void> =>
      pruneEmptyThreads({ keepThreadId: keepThreadId as Id<"agentThreads"> }).then(() => undefined),
    [pruneEmptyThreads],
  );

  return {
    pruneEmpty,
  };
}

// ── useThreadPreview ─────────────────────────────────────────────────────────
// Feeds the home-screen widget snapshot. No args; fields default to null when
// loading / no thread yet (the backend returns null when there are no threads).
export function useThreadPreview(): ThreadPreview | null {
  const preview = useQuery(api.agent.threads.latestThreadPreview);
  if (preview === undefined || preview === null) return null;
  return {
    threadId: (preview.threadId as string | null) ?? null,
    text: preview.text ? preview.text : null,
  };
}

// ── useCredits ──────────────────────────────────────────────────────────────
// Agent quota is part of the agent capability and exists with the free-tier meter alone.
export function useCredits(): { balance: CreditsBalance | null; isLoading: boolean } {
  const data = useQuery(api.agent.credits.balance);
  return {
    balance: (data ?? null) as CreditsBalance | null,
    isLoading: data === undefined,
  };
}

// ── useRateLimit ─────────────────────────────────────────────────────────────
// Reads the agent-owned balance summary. The backend defaults to the free tier.
export function useRateLimit() {
  const balance = useQuery(api.agent.credits.balance);

  return {
    messagesUsedToday: balance?.used ?? 0,
    tier: (balance?.tier ?? "free") as Tier,
    isLoading: balance === undefined,
  };
}
