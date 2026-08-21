import type { ConvexClient } from "convex/browser";
import {
  authStateFromViewer,
  createConvexClient,
  ensureAnonymousSession,
  requestEmailOtp,
  signOutSession,
  subscribeViewer,
  verifyEmailOtp,
  type AuthState,
  type Viewer,
} from "../../data/sync/convex-auth";
import {
  isHistorySyncOptedIn,
  setHistorySyncOptedIn,
} from "../../data/sync/history-sync";

export type SyncSessionSnapshot = {
  available: boolean;
  auth: AuthState;
  pending: boolean;
  error: string | null;
  historyOptIn: boolean;
};

type SyncSessionDependencies = {
  createClient: () => ConvexClient | null;
  ensureSession: (client: ConvexClient) => void;
  watchViewer: (
    client: ConvexClient,
    listener: (viewer: Viewer | null) => void,
  ) => () => void;
  requestOtp: (client: ConvexClient, email: string) => Promise<void>;
  verifyOtp: (
    client: ConvexClient,
    email: string,
    code: string,
  ) => Promise<void>;
  signOut: (client: ConvexClient) => Promise<void>;
  readHistoryOptIn: () => boolean;
  writeHistoryOptIn: (value: boolean) => void;
};

const defaultDependencies: SyncSessionDependencies = {
  createClient: createConvexClient,
  ensureSession: ensureAnonymousSession,
  watchViewer: subscribeViewer,
  requestOtp: requestEmailOtp,
  verifyOtp: verifyEmailOtp,
  signOut: signOutSession,
  readHistoryOptIn: isHistorySyncOptedIn,
  writeHistoryOptIn: setHistorySyncOptedIn,
};

const initialSnapshot = (): SyncSessionSnapshot => ({
  available: true,
  auth: { status: "loading" },
  pending: false,
  error: null,
  historyOptIn: false,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createSyncSessionStore(
  dependencies: SyncSessionDependencies = defaultDependencies,
) {
  let snapshot = initialSnapshot();
  let client: ConvexClient | null = null;
  let stopViewer: (() => void) | null = null;
  let started = false;
  const listeners = new Set<() => void>();

  const publish = (change: Partial<SyncSessionSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };

  const start = () => {
    if (started) return;
    started = true;
    const historyOptIn = dependencies.readHistoryOptIn();
    client = dependencies.createClient();
    if (!client) {
      publish({
        available: false,
        auth: { status: "unauthenticated" },
        historyOptIn,
      });
      return;
    }

    publish({ available: true, historyOptIn });
    dependencies.ensureSession(client);
    stopViewer = dependencies.watchViewer(client, (viewer) => {
      publish({ auth: authStateFromViewer(viewer) });
    });
  };

  const stop = () => {
    stopViewer?.();
    stopViewer = null;
    const activeClient = client;
    client = null;
    started = false;
    snapshot = initialSnapshot();
    if (activeClient) void activeClient.close();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  };

  const run = async (
    operation: (activeClient: ConvexClient) => Promise<void>,
    rethrow: boolean,
  ) => {
    if (!client) return;
    publish({ pending: true, error: null });
    try {
      await operation(client);
    } catch (error) {
      publish({ error: errorMessage(error) });
      if (rethrow) throw error;
    } finally {
      publish({ pending: false });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe,
    requestOtp: (email: string) =>
      run((activeClient) => dependencies.requestOtp(activeClient, email), true),
    verifyOtp: (email: string, code: string) =>
      run(
        (activeClient) => dependencies.verifyOtp(activeClient, email, code),
        true,
      ),
    signOut: () =>
      run((activeClient) => dependencies.signOut(activeClient), false),
    setHistoryOptIn: (value: boolean) => {
      dependencies.writeHistoryOptIn(value);
      publish({ historyOptIn: value });
    },
  };
}

export const syncSessionStore = createSyncSessionStore();
