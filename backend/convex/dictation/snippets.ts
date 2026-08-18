// Full-text expansions: dictating `trigger` inserts `expansion` instead.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("snippets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: { trigger: v.string(), expansion: v.string() },
  handler: async (ctx, { trigger, expansion }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const trimmedTrigger = trigger.trim();
    const trimmedExpansion = expansion.trim();
    if (!trimmedTrigger || !trimmedExpansion) {
      throw new Error("Trigger and expansion are required");
    }
    return await ctx.db.insert("snippets", {
      userId,
      trigger: trimmedTrigger,
      expansion: trimmedExpansion,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("snippets") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
