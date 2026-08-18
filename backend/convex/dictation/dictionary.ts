// Vocabulary dictionary: terms injected into the STT model to improve
// transcription accuracy (proper nouns, jargon). See replacements.ts for
// rewrite rules applied after transcription.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("dictionaryEntries")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const trimmed = term.trim();
    if (!trimmed) throw new Error("Term is required");
    return await ctx.db.insert("dictionaryEntries", {
      userId,
      term: trimmed,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("dictionaryEntries") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const entry = await ctx.db.get(id);
    if (!entry || entry.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
