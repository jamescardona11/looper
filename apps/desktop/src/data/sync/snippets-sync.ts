// Data boundary for the F3 user-snippets sync worker, modeled on
// dictionary-sync.ts (see that file for the full reconciliation rationale).
//
// Local storage (src-tauri/src/settings.rs) keeps `user_snippets:
// Vec<UserSnippet>` as a plain list with NO stable id of its own. Convex
// (backend/convex/dictation/snippets.ts) stores the same data as rows with a
// Convex `_id`. This module keys everything by the snippet's own `trigger`
// and keeps a small id-lookup cache in localStorage so pushes can later
// target the right row for removal.
//
// SQLite stays the source of truth for local reads: this module only PUSHES
// local changes to Convex and PULLS on (re)connect to union in anything
// missing locally - it never overwrites local state wholesale, and it does
// nothing at all when there's no authenticated (non-anonymous) session,
// per MEGAPLAN's "sin sesión real, todo sigue funcionando 100% local".
import { invoke } from "@tauri-apps/api/core";
import { api } from "@looper/backend/convex/_generated/api";
import type { Id } from "@looper/backend/dataModel";
import type { ConvexClient } from "convex/browser";
import type { UserSnippet } from "../../contracts/index";

const SNIPPET_IDS_KEY = "looper.sync.snippetIds";

// ── Local storage access (new invoke call sites - allowed in src/data/**) ──

export async function getLocalSnippets(): Promise<UserSnippet[]> {
  return invoke<UserSnippet[]>("get_snippets");
}

export async function setLocalSnippets(
  snippets: UserSnippet[],
): Promise<UserSnippet[]> {
  return invoke<UserSnippet[]>("set_snippets", { snippets });
}

// ── Pure merge/diff logic (unit-tested in tests/frontend/snippets-sync.test.ts) ──

const normalizeTrigger = (trigger: string) => trigger.trim().toLowerCase();
const snippetKey = (s: UserSnippet) => normalizeTrigger(s.trigger);

/** Union-merges `remote` snippets into `local`, keyed by `trigger`
 * (case-insensitive), preserving `local`'s order and never dropping a
 * local-only snippet (pull never deletes). Matches user_snippets.rs's own
 * `sanitize_user_snippets` de-dupe. */
export function unionMergeSnippets(
  local: UserSnippet[],
  remote: UserSnippet[],
): UserSnippet[] {
  const seen = new Set(local.map(snippetKey));
  const merged = [...local];
  for (const s of remote) {
    const key = snippetKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }
  return merged;
}

export type ListDiff<T> = { added: T[]; removed: T[] };

/** Diffs two snippet snapshots by `trigger` key (a changed `expansion` for an
 * existing `trigger` is treated as remove-old + add-new, since Convex rows
 * have no partial-update mutation - see snippets.ts). */
export function diffSnippets(
  previous: UserSnippet[],
  next: UserSnippet[],
): ListDiff<UserSnippet> {
  const previousByKey = new Map(previous.map((s) => [snippetKey(s), s]));
  const nextByKey = new Map(next.map((s) => [snippetKey(s), s]));
  const added: UserSnippet[] = [];
  const removed: UserSnippet[] = [];
  for (const [key, s] of nextByKey) {
    const prior = previousByKey.get(key);
    if (!prior || prior.expansion !== s.expansion) added.push(s);
  }
  for (const [key, s] of previousByKey) {
    if (!nextByKey.has(key) || nextByKey.get(key)?.expansion !== s.expansion)
      removed.push(s);
  }
  return { added, removed };
}

// ── Id-map cache (localStorage) ────────────────────────────────────────────

function readIdMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writeIdMap(key: string, map: Record<string, string>): void {
  localStorage.setItem(key, JSON.stringify(map));
}

// ── Convex calls ────────────────────────────────────────────────────────

type RemoteSnippetRow = { _id: string; trigger: string; expansion: string };

async function listRemoteSnippets(
  client: ConvexClient,
): Promise<RemoteSnippetRow[]> {
  const rows = await client.query(api.dictation.snippets.list, {});
  return (rows as RemoteSnippetRow[] | null) ?? [];
}

/**
 * Pull-on-reconnect: fetches the remote snippets, unions anything missing
 * into local SQLite, and records every remote row's id in the local id-map
 * cache (so a later local removal can push a matching Convex `remove`).
 * Returns the merged local snapshot so the caller can seed its push-diff
 * baseline.
 */
export async function pullAndMergeSnippets(
  client: ConvexClient,
): Promise<UserSnippet[]> {
  const [localSnippets, remoteSnippets] = await Promise.all([
    getLocalSnippets(),
    listRemoteSnippets(client),
  ]);

  const snippetIds = readIdMap(SNIPPET_IDS_KEY);
  for (const row of remoteSnippets)
    snippetIds[normalizeTrigger(row.trigger)] = row._id;
  writeIdMap(SNIPPET_IDS_KEY, snippetIds);

  const merged = unionMergeSnippets(
    localSnippets,
    remoteSnippets.map((row) => ({
      trigger: row.trigger,
      expansion: row.expansion,
    })),
  );

  return merged.length !== localSnippets.length
    ? await setLocalSnippets(merged)
    : localSnippets;
}

/** Push-on-change: diffs `previous` (last pushed snapshot) against `next`
 * (current local state) and applies the delta to Convex, updating the
 * id-map cache as rows are added/removed. */
export async function pushSnippetsDiff(
  client: ConvexClient,
  previous: UserSnippet[],
  next: UserSnippet[],
): Promise<void> {
  const { added, removed } = diffSnippets(previous, next);
  if (added.length === 0 && removed.length === 0) return;

  const ids = readIdMap(SNIPPET_IDS_KEY);

  // Removals go first: an edited expansion diffs as remove-old + add-new
  // under the SAME trigger key, so adding first would overwrite the id-map
  // entry and the removal would then delete the row just added.
  for (const snippet of removed) {
    const key = snippetKey(snippet);
    const id = ids[key];
    if (!id) continue;
    try {
      await client.mutation(api.dictation.snippets.remove, {
        id: id as Id<"snippets">,
      });
      delete ids[key];
    } catch (err) {
      console.warn(
        "[snippets-sync] failed to push snippet removal",
        snippet,
        err,
      );
    }
  }

  for (const snippet of added) {
    try {
      const id = await client.mutation(api.dictation.snippets.add, {
        trigger: snippet.trigger,
        expansion: snippet.expansion,
      });
      ids[snippetKey(snippet)] = id as string;
    } catch (err) {
      console.warn("[snippets-sync] failed to push snippet", snippet, err);
    }
  }

  writeIdMap(SNIPPET_IDS_KEY, ids);
}
