import { useThreadMaintenance, useThreads } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth";

// Owns the thread lifecycle for the Agent Workspace. The UI only needs the
// active thread and the auth gate; picking the newest real thread, creating the
// first one, and pruning stale empty threads stay here.
export function useAgentWorkspace(activeThreadId: string | null) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const { threads, isLoading: threadsLoading, create } = useThreads();
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const prunedRef = useRef(false);
  const { pruneEmpty } = useThreadMaintenance();
  const firstRealThread = threads?.find((thread) => (thread.messageCount ?? 0) > 0);
  const activeThread = threads?.find((thread) => thread._id === activeThreadId) ?? null;
  const nextThreadId = activeThreadId
    ? null
    : (firstRealThread?._id ?? threads?.[0]?._id ?? createdThreadId);

  useEffect(() => {
    // Only auto-create once auth is settled and authenticated. Otherwise a stale
    // threads array can fire create() during the unauthenticated redirect window.
    if (isLoading || !isAuthenticated) return;
    // And wait for the thread list to load. useThreads returns [] both while
    // loading and when genuinely empty.
    if (threadsLoading) return;
    if (activeThreadId || !threads || threads.length > 0 || creatingRef.current) return;
    creatingRef.current = true;
    void create(t("agent.newChat"))
      .then(setCreatedThreadId)
      .catch(() => {
        // Auth/user identity can settle a tick after isAuthenticated flips.
      })
      .finally(() => {
        creatingRef.current = false;
      });
  }, [threads, threadsLoading, activeThreadId, create, isAuthenticated, isLoading, t]);

  useEffect(() => {
    if (prunedRef.current || isLoading || !isAuthenticated || threadsLoading) return;
    if (!activeThreadId) return;
    prunedRef.current = true;
    void pruneEmpty(activeThreadId);
  }, [isLoading, isAuthenticated, threadsLoading, activeThreadId, pruneEmpty]);

  return {
    activeThreadId,
    activeThread,
    nextThreadId,
    isAuthenticated,
    isLoading,
    threadsLoading,
  };
}
