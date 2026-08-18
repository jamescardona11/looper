// Data boundary for the F3 settings sync worker: syncs Smart Modes (F5)
// `mode_rules` via `dictation/settings.ts`'s single versioned document
// (`settingsDoc`, see backend/convex/dictation/settings.ts). F2's transform
// presets are NOT a separate synced list - `TransformPreset` is a fixed enum
// choice embedded per-rule (`ModeRule.transform_preset`), so syncing
// `mode_rules` already carries them.
//
// The backend document is last-write-wins over the WHOLE blob (one `data`
// field, `version` bumped on every write - see settings.ts's comment), so
// this module mirrors that: it only ever writes `{ mode_rules }` as `data`,
// and only applies a pulled document locally when its `version` is newer
// than the last version this install itself pulled or pushed (tracked in
// `localStorage`), never overwriting a local edit made since.
import { invoke } from "@tauri-apps/api/core";
import { api } from "@looper/backend/convex/_generated/api";
import type { ConvexClient } from "convex/browser";
import type { ModeRule } from "../types";

const SETTINGS_VERSION_KEY = "looper.sync.settingsVersion";

type SyncedSettingsData = { mode_rules?: ModeRule[] };
type RemoteSettingsDoc = { data: SyncedSettingsData; version: number } | null;

async function getLocalModeRules(): Promise<ModeRule[]> {
  return invoke<ModeRule[]>("get_mode_rules");
}

async function setLocalModeRules(modeRules: ModeRule[]): Promise<ModeRule[]> {
  return invoke<ModeRule[]>("set_mode_rules", { modeRules });
}

function readLastSyncedVersion(): number {
  const raw = localStorage.getItem(SETTINGS_VERSION_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastSyncedVersion(version: number): void {
  localStorage.setItem(SETTINGS_VERSION_KEY, String(version));
}

/**
 * Pull-on-reconnect: if the remote settings document is newer than the last
 * version this install synced, applies its `mode_rules` locally (last-write-
 * wins for the whole document, matching the backend's own policy). Returns
 * the resulting local `mode_rules` so the caller can seed its push-diff
 * baseline.
 */
export async function pullModeRules(client: ConvexClient): Promise<ModeRule[]> {
  const remote = (await client.query(
    api.dictation.settings.get,
    {},
  )) as RemoteSettingsDoc;
  const local = await getLocalModeRules();
  if (!remote) return local;

  const lastSynced = readLastSyncedVersion();
  if (remote.version <= lastSynced) return local;

  writeLastSyncedVersion(remote.version);
  if (!Array.isArray(remote.data?.mode_rules)) return local;
  return setLocalModeRules(remote.data.mode_rules);
}

/**
 * Push-on-change: writes `mode_rules` as the settings document whenever it
 * differs from `previous` (the last snapshot this module pushed/pulled), and
 * records the resulting version so a later pull doesn't re-apply our own
 * write as if it were a remote change.
 */
export async function pushModeRules(
  client: ConvexClient,
  previous: ModeRule[],
  next: ModeRule[],
): Promise<void> {
  if (JSON.stringify(previous) === JSON.stringify(next)) return;

  try {
    await client.mutation(api.dictation.settings.update, {
      data: { mode_rules: next },
    });
    const saved = (await client.query(
      api.dictation.settings.get,
      {},
    )) as RemoteSettingsDoc;
    if (saved) writeLastSyncedVersion(saved.version);
  } catch (err) {
    console.warn("[settings-sync] failed to push mode_rules", err);
  }
}
