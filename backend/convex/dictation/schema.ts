import { defineTable } from "convex/server";
import { v } from "convex/values";

// Dictation: per-user dictionary/replacements/snippets sync, an opt-in
// text-only transcription history, one versioned settings document per user,
// and the mobile↔desktop remote-dictation pairing channel. Audio is NEVER
// stored here.
export const dictationTables = {
  // Vocabulary hints injected into the STT model (proper nouns, jargon) — just
  // the term itself. See `replacements` for rewrite rules applied after
  // transcription. Terms and replacements use separate tables so each row
  // shape is explicit.
  dictionaryEntries: defineTable({
    userId: v.id("users"),
    term: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // Post-processing rewrite rules: every occurrence of `source` becomes
  // `destination` after transcription.
  replacements: defineTable({
    userId: v.id("users"),
    source: v.string(),
    destination: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // Full-text expansions: dictating `trigger` inserts `expansion` instead.
  snippets: defineTable({
    userId: v.id("users"),
    trigger: v.string(),
    expansion: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // Opt-in synced history: transcript TEXT + metadata only, never audio.
  transcriptions: defineTable({
    userId: v.id("users"),
    text: v.string(),
    source: v.union(v.literal("local"), v.literal("remote")),
    // Stable client-side id used to update a dictation after local edits
    // without duplicating it in synced history. Older rows may not have one.
    sourceId: v.optional(v.string()),
    // When the dictation happened on the source device. `createdAt` remains
    // the server-side sync time for backwards compatibility.
    occurredAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_source_id", ["userId", "sourceId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["userId"],
    }),

  // One versioned settings document per user. `data` is an opaque blob — the
  // backend just stores whatever the client sends and bumps `version`; the
  // desktop sync worker (outbox) owns field-level last-write-wins merging.
  settingsDoc: defineTable({
    userId: v.id("users"),
    data: v.any(),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Mobile↔desktop pairing channel for plain-text paste. Reviews/questions are
  // deliberately omitted because no desktop producer exists today.
  //
  // `sessionId` is a stable id the RECEIVER (desktop/CLI) generates and
  // persists locally — mobile never mints it. "Pairing" is just "same
  // authenticated user": there is no invite code, trusted-device list, or
  // revocation.
  //
  // Convex has no `onDisconnect` equivalent, so presence is heartbeat +
  // staleness only: the receiver must call `remote.registerSession`
  // periodically, and readers must treat `lastActiveAt` older than the active
  // threshold as gone. There is deliberately no TTL/expiry sweep for stale or
  // orphaned rows yet.
  remoteDictationSessions: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    name: v.string(),
    lastActiveAt: v.number(),
    status: v.union(v.literal("idle"), v.literal("pending")),
    pendingText: v.optional(v.string()),
    // Wall-clock timestamp of the current pendingText, for display only.
    pendingTextAt: v.optional(v.number()),
    // Monotonic counter bumped on every sendDictation — the ack idempotency
    // token. Millisecond timestamps can collide within a single tick, a
    // per-session counter can't.
    seq: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "lastActiveAt"])
    .index("by_user_session", ["userId", "sessionId"]),
};
