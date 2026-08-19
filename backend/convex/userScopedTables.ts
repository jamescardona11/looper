// Single source of truth for "the set of user-scoped tables".
//
// Historically this set was hand-maintained as three or four separate lists
// (purge USER_TABLES + STORAGE_TABLES + the export handler and upgrade
// USER_SCOPED_TABLES) that had already diverged. Each
// divergence was real policy: upgrade, deletion and export intentionally operate
// on different subsets, and some rows are owned indirectly by a parent.
//
// This module declares every user-scoped table ONCE with per-policy flags, and
// the consumers DERIVE their lists from it via filters. The flags encode the
// intentional per-consumer differences, so each derived list contains the SAME
// SET of tables as the hand-maintained one it replaces — the divergence is now
// explicit data, not three lists drifting apart. (List ORDER is not load-bearing:
// see the registry note below.) Root and module registries contribute rows with
// policy flags; every consumer updates automatically.
//
// Pure TS: no Convex runtime imports, directly unit-testable.

import { MEETING_USER_SCOPED_TABLES } from "./meetings/userScopedTables";

// Field(s) on a row that hold Convex storage blob ids, for cascade deletion.
type BlobExtractor = (row: any) => unknown[];

export type UserScopedTable = {
  // Table name as defined in schema.ts.
  table: string;
  // Most tables belong to userId. Product tables may use another explicit
  // owner field while participating in the same account-data policies.
  ownerField?: "userId" | "ownerId";
  // Index whose FIRST field is `userId` (so an eq("userId", …) prefix scan is
  // valid). `null` for byThreadOnly tables, which have no userId-first index.
  userIdIndex: string | null;
  // Row is keyed only by a parent record. Purge walks it through that parent,
  // while upgrade can still transfer it through its userId field.
  byThreadOnly: boolean;
  // Carries storage blob ids that must be deleted alongside the row on purge.
  hasStorageBlobs: boolean;
  // Extracts the blob ids from a row. Present iff hasStorageBlobs.
  blobs?: BlobExtractor;
  // Account deletion purges this table's rows for the owner.
  purgeOnDelete: boolean;
  // Anonymous → real account upgrade transfers this table's rows.
  transferOnUpgrade: boolean;
  // The data export includes this table's rows (personal data).
  exportPersonalData: boolean;
  // Stable top-level key in exportMyData. Present iff exportPersonalData.
  exportKey?: string;
};

// The registry. Declaration order follows the original purge USER_TABLES list for
// readability, but it is NOT load-bearing: every consumer is order-insensitive.
// The purge self-reschedules in budget-bounded batches until empty (it drains
// every table regardless of iteration order), and the upgrade transfer is keyed by
// table name. So the derived lists match the originals as SETS; exact order may
// differ with no behavioral effect. The characterization tests assert set-equality and
// the real purge/upgrade/export OUTCOMES, not list order.
export const USER_SCOPED_TABLE_REGISTRY: readonly UserScopedTable[] = [
  {
    table: "adminUsers",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  {
    table: "userSubscriptions",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "subscription",
  },
  {
    table: "paymentEvents",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: false,
  },
  {
    table: "agentThreads",
    userIdIndex: "by_user_recent",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "threads",
  },
  {
    table: "agentUsage",
    userIdIndex: "by_user_recent",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "usage",
  },
  {
    table: "sttTranscriptions",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: true,
    blobs: (r) => [r.audioStorageId],
    purgeOnDelete: true,
    transferOnUpgrade: false,
    exportPersonalData: true,
    exportKey: "stt",
  },
  {
    table: "onboardingStates",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "onboarding",
  },
  {
    table: "userApiKeys",
    userIdIndex: "by_user_provider",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    // Exported as metadata only (never the encrypted key material) — the export
    // handler maps the rows itself; this flag records that it participates.
    exportPersonalData: true,
    exportKey: "apiKeys",
  },
  {
    // Keyed only by thread; purge walks it via its parent thread. Carries a
    // userId column, so the anonymous-upgrade flow transfers it by field filter.
    table: "agentMessages",
    userIdIndex: null,
    byThreadOnly: true,
    hasStorageBlobs: false,
    purgeOnDelete: false,
    transferOnUpgrade: true,
    exportPersonalData: false,
  },
  {
    // Consumable credit balance — user-scoped, but intentionally outside every
    // purge/upgrade/health flow today (financial ledger handled separately).
    table: "creditBalance",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: false,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  {
    table: "creditTransactions",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: false,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  {
    // In-app feedback. userId is optional (anonymous feedback allowed); not part
    // of any purge/upgrade/health flow today.
    table: "feedback",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: false,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  {
    // Per-user mock-mode opt-in. Not part of any purge/upgrade/health flow today.
    table: "userMockMode",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: false,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  {
    table: "dictionaryEntries",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "dictionary",
  },
  {
    table: "replacements",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "replacements",
  },
  {
    table: "snippets",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "snippets",
  },
  {
    table: "transcriptions",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "dictationTranscriptions",
  },
  {
    table: "notes",
    userIdIndex: "by_user_updated",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "notes",
  },
  {
    table: "settingsDoc",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: true,
    exportPersonalData: true,
    exportKey: "dictationSettings",
  },
  {
    // Ephemeral device-pairing/presence state, not personal data — same
    // treatment as realtimeSessions: purged on account deletion, but not
    // transferred on anon upgrade or included in export/health.
    table: "remoteDictationSessions",
    userIdIndex: "by_user",
    byThreadOnly: false,
    hasStorageBlobs: false,
    purgeOnDelete: true,
    transferOnUpgrade: false,
    exportPersonalData: false,
  },
  ...MEETING_USER_SCOPED_TABLES,
] as const;

// Account-owned tables that require parent-aware deletion instead of a direct
// userId scan. accountData owns their cascade explicitly.
export const ACCOUNT_DATA_CASCADE_TABLES = [
  "authSessions",
  "authAccounts",
  "authRefreshTokens",
  "authVerificationCodes",
  "authVerifiers",
] as const;

// Tables outside account ownership. Keeping this list explicit makes every new
// schema table choose a lifecycle instead of silently escaping account deletion.
export const ACCOUNT_DATA_TABLE_EXCLUSIONS = {
  users: "Account root deleted synchronously before the background cascade.",
  authRateLimits: "Provider abuse-prevention state keyed by identifier, not account ownership.",
  waitlist: "Pre-account lead data governed by the waitlist retention policy.",
  anonymousUpgradeIntents:
    "Short-lived upgrade nonces keyed by the anonymous session, consumed on claim and expired by timestamp.",
} as const;

// A {table,index} pair for the userId-prefix-scan consumers (purge).
export type TableIndex = { table: string; index: string };
export type ExportPersonalDataTable = TableIndex & { exportKey: string };

function requireUserIdIndex(t: UserScopedTable): string {
  if (t.userIdIndex === null) {
    throw new Error(`userScopedTables: ${t.table} has no userId-first index`);
  }
  return t.userIdIndex;
}

function requireExportKey(t: UserScopedTable): string {
  if (!t.exportKey) {
    throw new Error(`userScopedTables: ${t.table} has no data export key`);
  }
  return t.exportKey;
}

export function ownerFieldForTable(table: string): "userId" | "ownerId" {
  return (
    USER_SCOPED_TABLE_REGISTRY.find((candidate) => candidate.table === table)?.ownerField ??
    "userId"
  );
}

// ── Derived consumer lists ────────────────────────────────────────────────

// purge USER_TABLES: every purge-on-delete table reachable by a userId prefix
// scan (i.e. not byThreadOnly), as {table, index}.
export function purgeUserTables(): TableIndex[] {
  return USER_SCOPED_TABLE_REGISTRY.filter((t) => t.purgeOnDelete && !t.byThreadOnly).map((t) => ({
    table: t.table,
    index: requireUserIdIndex(t),
  }));
}

// purge STORAGE_TABLES: purged tables that carry storage blobs, with their blob
// extractor.
export function purgeStorageTables(): Array<TableIndex & { blobs: BlobExtractor }> {
  return USER_SCOPED_TABLE_REGISTRY.filter((t) => t.purgeOnDelete && t.hasStorageBlobs).map(
    (t) => ({
      table: t.table,
      index: requireUserIdIndex(t),
      blobs: t.blobs as BlobExtractor,
    }),
  );
}

function isPlainPurgeTable(table: UserScopedTable): boolean {
  if (!table.purgeOnDelete || table.byThreadOnly || table.hasStorageBlobs) return false;
  if (table.table === "agentThreads") return false;
  return true;
}

// purge PLAIN_TABLES: purge-by-userId tables with no blobs. Thread-owned data,
// when installed, is handled first by the account cascade.
export function purgePlainTables(): TableIndex[] {
  return USER_SCOPED_TABLE_REGISTRY.filter(isPlainPurgeTable).map((table) => ({
    table: table.table,
    index: requireUserIdIndex(table),
  }));
}

// upgrade USER_SCOPED_TABLES: tables transferred on anonymous→real upgrade.
export function upgradeScopedTables(): string[] {
  return USER_SCOPED_TABLE_REGISTRY.filter((t) => t.transferOnUpgrade).map((t) => t.table);
}

// Tables whose rows the data export includes (personal data).
export function exportPersonalDataTables(): string[] {
  return USER_SCOPED_TABLE_REGISTRY.filter((t) => t.exportPersonalData).map((t) => t.table);
}

// data export rows keyed by the stable top-level payload names in exportMyData.
export function exportPersonalDataTableDescriptors(): ExportPersonalDataTable[] {
  return USER_SCOPED_TABLE_REGISTRY.filter((t) => t.exportPersonalData).map((t) => ({
    table: t.table,
    index: requireUserIdIndex(t),
    exportKey: requireExportKey(t),
  }));
}
