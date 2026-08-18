// Post-processing rewrite rules: every occurrence of `source` becomes
// `destination` after transcription. See dictionary.ts for plain vocabulary
// hints with no rewrite.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("replacements")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: { source: v.string(), destination: v.string() },
  handler: async (ctx, { source, destination }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const trimmedSource = source.trim();
    const trimmedDestination = destination.trim();
    if (!trimmedSource || !trimmedDestination) {
      throw new Error("Source and destination are required");
    }
    return await ctx.db.insert("replacements", {
      userId,
      source: trimmedSource,
      destination: trimmedDestination,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("replacements") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
