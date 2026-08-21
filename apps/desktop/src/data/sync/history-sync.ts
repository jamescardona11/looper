// Data boundary for the opt-in text-only transcription history sync. Off by
// default - the toggle lives in the Sync
// tab (see ../features/sync) and is persisted locally in `localStorage`
// (a per-device preference, not account data, so it doesn't need a Convex
// round-trip or a new Rust settings field).
//
// When on AND signed in with a real (non-anonymous) account, every
// successfully-inserted local transcription's TEXT is pushed to
// `dictation/transcriptions.ts` - never `audio_path`. Already-synced rows are
// tracked via the `synced` column on `TranscriptionRecord`
// (src-tauri/src/storage.rs), which the backend already resets to `false` on
// any edit (LLM cleanup/revert), so an edited row is re-pushed automatically.
import { invoke } from "@tauri-apps/api/core";
import { api } from "@looper/backend/convex/_generated/api";
import type { ConvexClient } from "convex/browser";
import {
  getTranscriptions,
  subscribeTranscriptionEvents,
} from "../transcription";
import type { TranscriptionRecord } from "../../contracts/index";

const HISTORY_OPT_IN_KEY = "looper.sync.historyOptIn";
// Bounds the one-time backlog push after signing in, so a long-time local
// user doesn't flood a first connection with years of history in one go.
const BACKLOG_PUSH_LIMIT = 50;

export function isHistorySyncOptedIn(): boolean {
  return localStorage.getItem(HISTORY_OPT_IN_KEY) === "true";
}

export function setHistorySyncOptedIn(value: boolean): void {
  localStorage.setItem(HISTORY_OPT_IN_KEY, value ? "true" : "false");
}

async function pushRecord(
  client: ConvexClient,
  record: TranscriptionRecord,
): Promise<void> {
  if (record.status !== "success" || record.synced || !record.text.trim())
    return;
  try {
    const occurredAt = Date.parse(record.timestamp);
    await client.mutation(api.dictation.transcriptions.record, {
      text: record.text,
      source: "local",
      sourceId: record.id,
      ...(Number.isFinite(occurredAt) ? { occurredAt } : {}),
    });
    await invoke("mark_transcription_synced", { id: record.id });
  } catch (err) {
    console.warn("[history-sync] failed to push transcription", record.id, err);
  }
}

/** One-time backlog push of unsynced local transcriptions, newest first,
 * capped at `BACKLOG_PUSH_LIMIT`. Call when a real session becomes active. */
export async function pushUnsyncedBacklog(client: ConvexClient): Promise<void> {
  if (!isHistorySyncOptedIn()) return;
  let records: TranscriptionRecord[];
  try {
    records = await getTranscriptions();
  } catch (err) {
    console.warn("[history-sync] failed to read local transcriptions", err);
    return;
  }
  const unsynced = records.filter((r) => r.status === "success" && !r.synced);
  for (const record of unsynced.slice(0, BACKLOG_PUSH_LIMIT)) {
    await pushRecord(client, record);
  }
}

/** Subscribes to `transcription:complete` and pushes each new record's text
 * (opt-in gated, checked per-event so toggling off stops new pushes
 * immediately). Returns an unsubscribe function. */
export function startHistorySync(client: ConvexClient): () => void {
  let cancelled = false;
  const subscriptions = subscribeTranscriptionEvents({
    onComplete: ({ record }) => {
      if (!record || cancelled || !isHistorySyncOptedIn()) return;
      void pushRecord(client, record);
    },
  });

  return () => {
    cancelled = true;
    subscriptions.forEach((subscription) => {
      subscription.then((unlisten) => unlisten()).catch(() => {});
    });
  };
}
