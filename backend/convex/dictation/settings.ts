// One versioned settings document per user. `data` is an opaque blob the
// desktop sync worker owns the shape of; the backend just stores the latest
// write and bumps `version` using last-write-wins semantics.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("settingsDoc")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const update = mutation({
  args: { data: v.any() },
  handler: async (ctx, { data }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const existing = await ctx.db
      .query("settingsDoc")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data, version: existing.version + 1, updatedAt });
      return existing._id;
    }
    return await ctx.db.insert("settingsDoc", { userId, data, version: 1, updatedAt });
  },
});
