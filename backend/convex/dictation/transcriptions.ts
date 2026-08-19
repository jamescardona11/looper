// Opt-in synced transcription history: TEXT + metadata only, never audio.
// `source` records whether the text came from a local dictation or was
// received over the remote-dictation channel (see remote.ts).

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertOwned } from "../lib/ownership";

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("transcriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const record = mutation({
  args: {
    text: v.string(),
    source: v.union(v.literal("local"), v.literal("remote")),
    sourceId: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, { text, source, sourceId, occurredAt }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Text is required");
    const normalizedSourceId = sourceId?.trim() || undefined;
    if (normalizedSourceId && normalizedSourceId.length > 200) {
      throw new Error("Source id is too long");
    }
    const now = Date.now();
    const normalizedOccurredAt =
      occurredAt !== undefined && Number.isFinite(occurredAt) && occurredAt > 0 ? occurredAt : now;

    if (normalizedSourceId) {
      const existing = await ctx.db
        .query("transcriptions")
        .withIndex("by_user_source_id", (q) =>
          q.eq("userId", userId).eq("sourceId", normalizedSourceId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          text: trimmed,
          source,
          occurredAt: normalizedOccurredAt,
          createdAt: now,
        });
        return existing._id;
      }
    }

    return await ctx.db.insert("transcriptions", {
      userId,
      text: trimmed,
      source,
      sourceId: normalizedSourceId,
      occurredAt: normalizedOccurredAt,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("transcriptions") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    await assertOwned(ctx, "transcriptions", id, userId);
    await ctx.db.delete(id);
  },
});
