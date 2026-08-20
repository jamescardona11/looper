// Data boundary for the F3 sync engine: the background orchestrator that
// wires auth state (convex-auth.ts) to the per-domain sync workers
// (dictionary-sync.ts, settings-sync.ts, history-sync.ts). Started once from
// the `main` window (see ../app/runtime/window-services.tsx) - that's the one
// window that's always alive, and `settings:changed` (emitted by
// set_dictionary/set_replacements/set_snippets/set_mode_rules) reaches it regardless of
// which window the edit happened in, since Tauri broadcasts app events to
// every window.
//
// Runs 100% local (no-op) until a REAL (non-anonymous) session exists - the
// anonymous session ensureAnonymousSession keeps alive for remote-dictation.ts
// never triggers any of this, per MEGAPLAN's "sin sesión real, todo sigue
// funcionando 100% local".
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  createConvexClient,
  ensureAnonymousSession,
  subscribeViewer,
  type AuthStatus,
} from "./convex-auth";
import {
  pullAndMergeDictionary,
  pushDictionaryDiff,
  pushReplacementsDiff,
} from "./dictionary-sync";
import { pullAndMergeSnippets, pushSnippetsDiff } from "./snippets-sync";
import { pullModeRules, pushModeRules } from "./settings-sync";
import { pushUnsyncedBacklog, startHistorySync } from "./history-sync";
import type { ConvexClient } from "convex/browser";
import type {
  ModeRule,
  Replacement,
  StoredSettings,
  UserSnippet,
} from "../types";

const EVENT_SETTINGS_CHANGED = "settings:changed";

type Snapshot = {
  dictionary: string[];
  replacements: Replacement[];
  snippets: UserSnippet[];
  modeRules: ModeRule[];
};

/**
 * Starts the sync engine: wires its own Convex client + anonymous-by-default
 * session, then activates the dictionary/settings/history sync workers only
 * while the session is a REAL (non-anonymous) account. Returns a cleanup
 * function - call it on unmount.
 *
 * No-ops (logs a warning, returns a no-op cleanup) when `VITE_CONVEX_URL`
 * isn't configured, matching remote-dictation.ts's fail-closed behavior.
 */
export function startSyncEngine(): () => void {
  const client = createConvexClient();
  if (!client) {
    console.warn("[sync-engine] VITE_CONVEX_URL not set - sync disabled");
    return () => {};
  }

  ensureAnonymousSession(client);

  let previousStatus: AuthStatus = "loading";
  let snapshot: Snapshot | null = null;
  let stopHistorySync: (() => void) | null = null;
  let settingsUnlisten: UnlistenFn | null = null;
  let cancelled = false;
  let activationVersion = 0;

  const stopActiveSync = () => {
    activationVersion += 1;
    stopHistorySync?.();
    stopHistorySync = null;
    settingsUnlisten?.();
    settingsUnlisten = null;
    snapshot = null;
  };

  const startActiveSync = async (
    activeClient: ConvexClient,
    activeVersion: number,
  ) => {
    const [{ dictionary, replacements }, snippets, modeRules] =
      await Promise.all([
        pullAndMergeDictionary(activeClient),
        pullAndMergeSnippets(activeClient),
        pullModeRules(activeClient),
      ]);
    if (cancelled || activeVersion !== activationVersion) return;
    snapshot = { dictionary, replacements, snippets, modeRules };

    void pushUnsyncedBacklog(activeClient);
    stopHistorySync = startHistorySync(activeClient);

    const unlisten = await listen<StoredSettings>(
      EVENT_SETTINGS_CHANGED,
      ({ payload }) => {
        if (!snapshot) return;
        const previous = snapshot;
        snapshot = {
          dictionary: payload.dictionary,
          replacements: payload.replacements,
          snippets: payload.user_snippets,
          modeRules: payload.mode_rules,
        };
        void pushDictionaryDiff(
          activeClient,
          previous.dictionary,
          payload.dictionary,
        );
        void pushReplacementsDiff(
          activeClient,
          previous.replacements,
          payload.replacements,
        );
        void pushSnippetsDiff(
          activeClient,
          previous.snippets,
          payload.user_snippets,
        );
        void pushModeRules(
          activeClient,
          previous.modeRules,
          payload.mode_rules,
        );
      },
    );
    if (cancelled || activeVersion !== activationVersion) {
      unlisten();
      return;
    }
    settingsUnlisten = unlisten;
  };

  const unsubscribeViewer = subscribeViewer(client, (viewer) => {
    const status: AuthStatus = !viewer
      ? "unauthenticated"
      : viewer.isAnonymous
        ? "anonymous"
        : "authenticated";

    if (status === previousStatus) return;
    const becameAuthenticated =
      status === "authenticated" && previousStatus !== "authenticated";
    const leftAuthenticated =
      status !== "authenticated" && previousStatus === "authenticated";
    previousStatus = status;

    if (leftAuthenticated) stopActiveSync();
    if (becameAuthenticated) {
      const activeVersion = ++activationVersion;
      void startActiveSync(client, activeVersion).catch((err) => {
        console.warn("[sync-engine] failed to start active sync", err);
      });
    }
  });

  return () => {
    cancelled = true;
    unsubscribeViewer();
    stopActiveSync();
    void client.close();
  };
}
