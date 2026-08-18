import { useSyncExternalStore } from "react";
import {
  syncSessionStore,
  type SyncSessionSnapshot,
} from "./sync-session-store";

export type SyncSession = SyncSessionSnapshot & {
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  setHistoryOptIn: (value: boolean) => void;
};

export function useSyncSession(): SyncSession {
  const snapshot = useSyncExternalStore(
    syncSessionStore.subscribe,
    syncSessionStore.getSnapshot,
    syncSessionStore.getSnapshot,
  );

  return {
    ...snapshot,
    requestOtp: syncSessionStore.requestOtp,
    verifyOtp: syncSessionStore.verifyOtp,
    signOut: syncSessionStore.signOut,
    setHistoryOptIn: syncSessionStore.setHistoryOptIn,
  };
}
