// Data boundary for the "remote dictation" domain (mobile -> desktop paste
// channel, see backend/convex/dictation/remote.ts). This is the ONLY module
// allowed to import `invoke` from `@tauri-apps/api/*` for this domain (F0c
// boundary, see apps/desktop/eslint.config.js) - it's also the only module
// that talks to Convex directly. Everything else in the frontend goes
// through `startRemoteDictationConsumer` below.
//
// Scope (see MEGAPLAN F3.x): desktop is the RECEIVER. It registers itself as
// a session, subscribes to pending dictated text, inserts it via the same
// `assistive::insert_text` path local transcriptions use, and acks
// (`consumeDictation`) once inserted. Sub-protocol A only (plain-text
// paste) - matches backend/convex/dictation/remote.ts.
//
// Every function in dictation/remote.ts requires an authenticated Convex
// user (`getAuthUserId`), so this consumer wires a MINIMAL anonymous Convex
// Auth session (see convex-auth.ts, F3-lite) before registering. That
// session exists ONLY to satisfy this auth check - it is not a substitute
// for real user auth/sign-in (that is full F3, out of scope here), and it
// does not sync dictionary/history/settings. If the session can't be
// established (e.g. no VITE_CONVEX_URL configured), calls still fail
// closed: `registerSession` / `consumeDictation` reject and
// `getPendingDictation` resolves to `null`, all caught and logged rather
// than thrown, so a build without Convex wiring still starts cleanly.
// `sessionId` below is only a local per-install device label to tell
// multiple desktop installs apart under the same account - it is not a
// substitute for user auth either.
import { invoke } from "@tauri-apps/api/core";
import { api } from "@looper/backend/convex/_generated/api";
import { ConvexClient } from "convex/browser";
import { ensureAnonymousSession } from "./convex-auth";

const HEARTBEAT_INTERVAL_MS = 60_000;
const REGISTER_RETRY_DELAY_MS = 1_000;
const REGISTER_RETRY_ATTEMPTS = 5;
const SESSION_ID_STORAGE_KEY = "looper.remoteDictation.sessionId";
const SESSION_NAME = "Desktop";

type PendingDictation = {
  text: string;
  pendingTextAt: number;
  seq: number;
} | null;

type RemoteDictationClient = {
  mutation: (name: unknown, args: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (
    name: unknown,
    args: Record<string, unknown>,
    callback: (pending: PendingDictation) => void,
    onError: (err: unknown) => void,
  ) => () => void;
  close: () => Promise<void> | void;
};

type RemoteDictationConsumerDeps = {
  convexUrl?: string;
  clientFactory?: (url: string) => RemoteDictationClient;
  ensureSession?: (client: RemoteDictationClient) => void;
  insertText?: (text: string) => Promise<void>;
  sessionId?: string;
  sessionName?: string;
};

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_STORAGE_KEY, created);
  return created;
}

/**
 * Starts the remote-dictation consumer: registers this desktop install as a
 * receiver, subscribes to pending dictated text, and inserts + acknowledges
 * it as it arrives. Returns a cleanup function that ends the session and
 * closes the Convex connection - call it on unmount.
 *
 * No-ops (logs a warning, returns a no-op cleanup) when `VITE_CONVEX_URL`
 * isn't configured, so a build without Convex wiring still starts cleanly.
 */
export function startRemoteDictationConsumer(
  deps: RemoteDictationConsumerDeps = {},
): () => void {
  const url = deps.convexUrl ?? import.meta.env.VITE_CONVEX_URL;
  if (!url) {
    console.warn(
      "[remote-dictation] VITE_CONVEX_URL not set - remote dictation disabled",
    );
    return () => {};
  }

  const sessionId = deps.sessionId ?? getOrCreateSessionId();
  const sessionName = deps.sessionName ?? SESSION_NAME;
  const client =
    deps.clientFactory?.(url) ??
    (new ConvexClient(url) as unknown as RemoteDictationClient);
  const ensureSession =
    deps.ensureSession ??
    ((remoteClient: RemoteDictationClient) => {
      ensureAnonymousSession(remoteClient as unknown as ConvexClient);
    });
  ensureSession(client);
  let consuming = false;
  const insertText = deps.insertText ?? insertRemoteText;
  const registerRetryTimers = new Set<ReturnType<typeof setTimeout>>();

  const register = (attempt = 0) => {
    client
      .mutation(api.dictation.remote.registerSession, {
        sessionId,
        name: sessionName,
      })
      .catch((err: unknown) => {
        console.warn("[remote-dictation] registerSession failed", err);
        if (attempt >= REGISTER_RETRY_ATTEMPTS) return;
        const timer = setTimeout(() => {
          registerRetryTimers.delete(timer);
          register(attempt + 1);
        }, REGISTER_RETRY_DELAY_MS);
        registerRetryTimers.add(timer);
      });
  };
  register();
  const heartbeat = setInterval(register, HEARTBEAT_INTERVAL_MS);

  const unsubscribe = client.onUpdate(
    api.dictation.remote.getPendingDictation,
    { sessionId },
    (pending: PendingDictation) => {
      if (!pending || consuming) return;
      consuming = true;
      void insertAndAck(client, sessionId, pending, insertText).finally(() => {
        consuming = false;
      });
    },
    (err: unknown) => {
      console.warn(
        "[remote-dictation] getPendingDictation subscription error",
        err,
      );
    },
  );

  return () => {
    clearInterval(heartbeat);
    for (const timer of registerRetryTimers) clearTimeout(timer);
    registerRetryTimers.clear();
    unsubscribe();
    client
      .mutation(api.dictation.remote.endSession, { sessionId })
      .catch(() => {});
    void client.close();
  };
}

async function insertAndAck(
  client: RemoteDictationClient,
  sessionId: string,
  pending: NonNullable<PendingDictation>,
  insertText: (text: string) => Promise<void>,
): Promise<void> {
  try {
    await insertText(pending.text);
    await client.mutation(api.dictation.remote.consumeDictation, {
      sessionId,
      seq: pending.seq,
    });
  } catch (err) {
    console.warn(
      "[remote-dictation] failed to insert/acknowledge pending dictation",
      err,
    );
  }
}

function insertRemoteText(text: string): Promise<void> {
  return invoke("insert_remote_text", { text });
}
