// Data boundary for the dictionary/replacements sync worker and its
// reconciliation contract.
//
// Local storage (src-tauri/src/settings.rs) keeps `dictionary: Vec<String>`
// and `replacements: Vec<Replacement>` as plain lists with NO stable id of
// their own. Convex (backend/convex/dictation/{dictionary,replacements}.ts)
// stores the same data as rows with a Convex `_id`. To reconcile "list
// without id" against "rows with id" without inventing a new local id
// column, this module keys everything by the row's own content (the
// dictionary term; `from` for a replacement) and keeps a small id-lookup
// cache in localStorage so pushes can later target the right row for
// removal.
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
import type { Replacement, StoredSettings } from "../../contracts/index";

const DICTIONARY_IDS_KEY = "looper.sync.dictionaryIds";
const REPLACEMENT_IDS_KEY = "looper.sync.replacementIds";

// ── Local storage access (new invoke call sites - allowed in src/data/**) ──

async function getLocalDictionary(): Promise<string[]> {
  const settings = await invoke<StoredSettings>("get_settings");
  return settings.dictionary;
}

export async function getLocalReplacements(): Promise<Replacement[]> {
  return invoke<Replacement[]>("get_replacements");
}

export async function setLocalDictionary(entries: string[]): Promise<string[]> {
  return invoke<string[]>("set_dictionary", { entries });
}

export async function setLocalReplacements(
  replacements: Replacement[],
): Promise<Replacement[]> {
  return invoke<Replacement[]>("set_replacements", { replacements });
}

export async function getDictionaryUsage(): Promise<Record<string, number>> {
  return invoke<Record<string, number>>("get_dictionary_usage");
}

// ── Pure merge/diff logic (unit-tested in tests/frontend/dictionary-sync.test.ts) ──

const normalizeTerm = (term: string) => term.trim().toLowerCase();
const replacementKey = (r: Replacement) => normalizeTerm(r.from);

/** Union-merges `remote` terms into `local`, preserving `local`'s order and
 * never dropping a local-only term (pull never deletes). Case-insensitive
 * de-dupe, matching dictionary.rs's own `sanitize_dictionary_entries`. */
export function unionMergeDictionary(
  local: string[],
  remote: string[],
): string[] {
  const seen = new Set(local.map(normalizeTerm));
  const merged = [...local];
  for (const term of remote) {
    const key = normalizeTerm(term);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(term);
    }
  }
  return merged;
}

/** Same union-merge for replacements, keyed by `from` (case-insensitive),
 * matching dictionary.rs's own `sanitize_replacements`. */
export function unionMergeReplacements(
  local: Replacement[],
  remote: Replacement[],
): Replacement[] {
  const seen = new Set(local.map(replacementKey));
  const merged = [...local];
  for (const r of remote) {
    const key = replacementKey(r);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }
  return merged;
}

export type ListDiff<T> = { added: T[]; removed: T[] };

/** Diffs two dictionary snapshots by exact term (used for push-on-change:
 * `previous` is the last snapshot this module pushed, `next` is the current
 * local state). */
export function diffDictionary(
  previous: string[],
  next: string[],
): ListDiff<string> {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  return {
    added: next.filter((term) => !previousSet.has(term)),
    removed: previous.filter((term) => !nextSet.has(term)),
  };
}

/** Diffs two replacement snapshots by `from` key (a changed `to` for an
 * existing `from` is treated as remove-old + add-new, since Convex rows have
 * no partial-update mutation - see replacements.ts). */
export function diffReplacements(
  previous: Replacement[],
  next: Replacement[],
): ListDiff<Replacement> {
  const previousByKey = new Map(previous.map((r) => [replacementKey(r), r]));
  const nextByKey = new Map(next.map((r) => [replacementKey(r), r]));
  const added: Replacement[] = [];
  const removed: Replacement[] = [];
  for (const [key, r] of nextByKey) {
    const prior = previousByKey.get(key);
    if (!prior || prior.to !== r.to) added.push(r);
  }
  for (const [key, r] of previousByKey) {
    if (!nextByKey.has(key) || nextByKey.get(key)?.to !== r.to) removed.push(r);
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

type RemoteDictionaryRow = { _id: string; term: string };
type RemoteReplacementRow = {
  _id: string;
  source: string;
  destination: string;
};

async function listRemoteDictionary(
  client: ConvexClient,
): Promise<RemoteDictionaryRow[]> {
  const rows = await client.query(api.dictation.dictionary.list, {});
  return (rows as RemoteDictionaryRow[] | null) ?? [];
}

async function listRemoteReplacements(
  client: ConvexClient,
): Promise<RemoteReplacementRow[]> {
  const rows = await client.query(api.dictation.replacements.list, {});
  return (rows as RemoteReplacementRow[] | null) ?? [];
}

/**
 * Pull-on-reconnect: fetches the remote dictionary + replacements, unions
 * anything missing into local SQLite, and records every remote row's id in
 * the local id-map cache (so a later local removal can push a matching
 * Convex `remove`). Returns the merged local snapshots so the caller can seed
 * its push-diff baseline.
 */
export async function pullAndMergeDictionary(
  client: ConvexClient,
): Promise<{ dictionary: string[]; replacements: Replacement[] }> {
  const [
    localDictionary,
    localReplacements,
    remoteDictionary,
    remoteReplacements,
  ] = await Promise.all([
    getLocalDictionary(),
    getLocalReplacements(),
    listRemoteDictionary(client),
    listRemoteReplacements(client),
  ]);

  const dictionaryIds = readIdMap(DICTIONARY_IDS_KEY);
  for (const row of remoteDictionary)
    dictionaryIds[normalizeTerm(row.term)] = row._id;
  writeIdMap(DICTIONARY_IDS_KEY, dictionaryIds);

  const replacementIds = readIdMap(REPLACEMENT_IDS_KEY);
  for (const row of remoteReplacements) {
    replacementIds[normalizeTerm(row.source)] = row._id;
  }
  writeIdMap(REPLACEMENT_IDS_KEY, replacementIds);

  const mergedDictionary = unionMergeDictionary(
    localDictionary,
    remoteDictionary.map((row) => row.term),
  );
  const mergedReplacements = unionMergeReplacements(
    localReplacements,
    remoteReplacements.map((row) => ({
      from: row.source,
      to: row.destination,
    })),
  );

  const dictionary =
    mergedDictionary.length !== localDictionary.length
      ? await setLocalDictionary(mergedDictionary)
      : localDictionary;
  const replacements =
    mergedReplacements.length !== localReplacements.length
      ? await setLocalReplacements(mergedReplacements)
      : localReplacements;

  return { dictionary, replacements };
}

/** Push-on-change: diffs `previous` (last pushed snapshot) against `next`
 * (current local state) and applies the delta to Convex, updating the
 * id-map cache as rows are added/removed. */
export async function pushDictionaryDiff(
  client: ConvexClient,
  previous: string[],
  next: string[],
): Promise<void> {
  const { added, removed } = diffDictionary(previous, next);
  if (added.length === 0 && removed.length === 0) return;

  const ids = readIdMap(DICTIONARY_IDS_KEY);

  for (const term of added) {
    try {
      const id = await client.mutation(api.dictation.dictionary.add, { term });
      ids[normalizeTerm(term)] = id as string;
    } catch (err) {
      console.warn(
        "[dictionary-sync] failed to push dictionary term",
        term,
        err,
      );
    }
  }

  for (const term of removed) {
    const id = ids[normalizeTerm(term)];
    if (!id) continue;
    try {
      await client.mutation(api.dictation.dictionary.remove, {
        id: id as Id<"dictionaryEntries">,
      });
      delete ids[normalizeTerm(term)];
    } catch (err) {
      console.warn(
        "[dictionary-sync] failed to push dictionary removal",
        term,
        err,
      );
    }
  }

  writeIdMap(DICTIONARY_IDS_KEY, ids);
}

/** Push-on-change for replacements, mirroring `pushDictionaryDiff`. */
export async function pushReplacementsDiff(
  client: ConvexClient,
  previous: Replacement[],
  next: Replacement[],
): Promise<void> {
  const { added, removed } = diffReplacements(previous, next);
  if (added.length === 0 && removed.length === 0) return;

  const ids = readIdMap(REPLACEMENT_IDS_KEY);

  // Removals must run before adds: editing a replacement's `to` diffs as
  // remove+add under the same key (`from`), so an add-first order would
  // overwrite the id-map entry and the removal would then delete the row
  // just created, leaving the stale row remotely.
  for (const replacement of removed) {
    const key = replacementKey(replacement);
    const id = ids[key];
    if (!id) continue;
    try {
      await client.mutation(api.dictation.replacements.remove, {
        id: id as Id<"replacements">,
      });
      delete ids[key];
    } catch (err) {
      console.warn(
        "[dictionary-sync] failed to push replacement removal",
        replacement,
        err,
      );
    }
  }

  for (const replacement of added) {
    try {
      const id = await client.mutation(api.dictation.replacements.add, {
        source: replacement.from,
        destination: replacement.to,
      });
      ids[replacementKey(replacement)] = id as string;
    } catch (err) {
      console.warn(
        "[dictionary-sync] failed to push replacement",
        replacement,
        err,
      );
    }
  }

  writeIdMap(REPLACEMENT_IDS_KEY, ids);
}
