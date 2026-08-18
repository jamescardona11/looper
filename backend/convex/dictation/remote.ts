// Mobile↔desktop remote-dictation pairing channel for plain-text paste.
//
// Pairing model: both sides authenticate as the SAME Convex user; "pairing" is
// just "same account", there is no invite code or device trust list.
//   - The RECEIVER (desktop/CLI) generates and persists its own `sessionId`,
//     then calls `registerSession` on start and periodically as a heartbeat
//     (Convex has no `onDisconnect`, so presence is heartbeat + staleness only).
//   - Mobile calls `listActiveSessions` to discover receivers, then
//     `sendDictation` to push dictated text to one of them.
//   - The receiver subscribes to `getPendingDictation` and, after inserting the
//     text locally, calls `consumeDictation` to ack it — passing back the
//     `seq` it read so a second in-flight dictation can't be silently dropped
//     by a stale ack.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";

const ACTIVE_SESSION_WINDOW_MS = 20 * 60 * 1000;

async function findSession(
  ctx: QueryCtx,
  userId: Id<"users">,
  sessionId: string,
): Promise<Doc<"remoteDictationSessions"> | null> {
  return await ctx.db
    .query("remoteDictationSessions")
    .withIndex("by_user_session", (q) => q.eq("userId", userId).eq("sessionId", sessionId))
    .unique();
}

// Receiver call on startup and on every heartbeat tick to announce/refresh its
// presence. Never touches an in-flight pendingText/status.
export const registerSession = mutation({
  args: { sessionId: v.string(), name: v.string() },
  handler: async (ctx, { sessionId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const existing = await findSession(ctx, userId, sessionId);
    const lastActiveAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { name, lastActiveAt });
      return existing._id;
    }
    return await ctx.db.insert("remoteDictationSessions", {
      userId,
      sessionId,
      name,
      lastActiveAt,
      status: "idle",
      seq: 0,
      createdAt: lastActiveAt,
    });
  },
});

// Receiver call on graceful shutdown — best-effort cleanup. A crash or lost
// connection instead relies on `listActiveSessions`' staleness filter, since
// Convex has no onDisconnect equivalent.
export const endSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const existing = await findSession(ctx, userId, sessionId);
    if (existing) await ctx.db.delete(existing._id);
  },
});

// Mobile call to discover receivers to dictate into.
export const listActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const sessions = await ctx.db
      .query("remoteDictationSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return sessions.filter((session) => now - session.lastActiveAt <= ACTIVE_SESSION_WINDOW_MS);
  },
});

// Mobile call to push dictated text to a specific receiver.
export const sendDictation = mutation({
  args: { sessionId: v.string(), text: v.string() },
  handler: async (ctx, { sessionId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Text is required");
    const session = await findSession(ctx, userId, sessionId);
    if (!session) throw new Error("Session not found");
    const seq = session.seq + 1;
    await ctx.db.patch(session._id, {
      pendingText: trimmed,
      pendingTextAt: Date.now(),
      status: "pending",
      seq,
    });
    return { seq };
  },
});

// Receiver subscribes to this to learn about new dictated text in real time.
export const getPendingDictation = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const session = await findSession(ctx, userId, sessionId);
    if (!session || session.status !== "pending") return null;
    return { text: session.pendingText, pendingTextAt: session.pendingTextAt, seq: session.seq };
  },
});

// Receiver call after it has inserted `pendingText` locally. `seq` must match
// what the receiver actually read: if mobile already sent a NEWER dictation in
// the meantime (bumping seq again), this is a no-op instead of clobbering it —
// the idempotency guard that prevents inserting the same text twice.
export const consumeDictation = mutation({
  args: { sessionId: v.string(), seq: v.number() },
  handler: async (ctx, { sessionId, seq }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const session = await findSession(ctx, userId, sessionId);
    if (!session) throw new Error("Session not found");
    if (session.seq !== seq) return { consumed: false };
    await ctx.db.patch(session._id, {
      pendingText: undefined,
      pendingTextAt: undefined,
      status: "idle",
    });
    return { consumed: true };
  },
});
