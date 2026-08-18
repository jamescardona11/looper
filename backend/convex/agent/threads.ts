// Thread CRUD: create, list (with pagination), archive, delete, rename.
// Threads are user-scoped; auth check on every mutation.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const createThread = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, { title = "New recording question" }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    return await ctx.db.insert("agentThreads", {
      userId,
      title,
      archived: false,
      pinned: false,
      lastMessageAt: Date.now(),
      messageCount: 0,
    });
  },
});

export const listThreads = query({
  args: {
    archived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { archived = false, limit = 50 }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("agentThreads")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).eq("archived", archived))
      .order("desc")
      .take(limit);
  },
});

// Compact preview of the user's most recent recording question, for the home-screen
// widget (last message snippet + a deep link to reopen the thread). Returns null
// when there are no threads/messages yet. Reactive: re-runs as new turns land.
export const latestThreadPreview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const thread = await ctx.db
      .query("agentThreads")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).eq("archived", false))
      .order("desc")
      .first();
    if (!thread) return null;

    // Newest *settled* message: skip the assistant streaming placeholder, whose
    // content is empty/partial and is patched ~4x/sec while a reply generates.
    // Showing the streaming row would render a blank/half-written headline AND make
    // this reactive query change on every chunk, firing a widget reload each time
    // (WidgetKit's daily reload budget is ~40-70 — exhausting it freezes the widget).
    // Skipping it keeps the preview stable until a reply completes: one update/turn.
    const recent = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(5);
    const settled = recent.find((m) => m.status !== "streaming" && m.content.trim().length > 0);

    return {
      threadId: thread._id,
      title: thread.title,
      // Bound the payload; the client re-truncates to its display length.
      text: settled ? settled.content.slice(0, 200) : "",
      role: settled?.role ?? null,
    };
  },
});

export const renameThread = mutation({
  args: { threadId: v.id("agentThreads"), title: v.string() },
  handler: async (ctx, { threadId, title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(threadId, { title });
  },
});

export const archiveThread = mutation({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(threadId, { archived: true });
  },
});

export const deleteThread = mutation({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not found");
    const messages = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
    await ctx.db.delete(threadId);
  },
});

// Sweep the user's empty recording questions (messageCount === 0) — the ones a
// message was never sent in. `keepThreadId` (the active thread) is spared so the
// thread the user is currently looking at survives. Safe: an empty thread has no
// content to lose. Called on the /agent route to clear leftovers from the old
// create-on-mount bug and any unused "+" threads. Returns how many were removed.
export const pruneEmptyThreads = mutation({
  args: { keepThreadId: v.optional(v.id("agentThreads")) },
  handler: async (ctx, { keepThreadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const threads = await ctx.db
      .query("agentThreads")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).eq("archived", false))
      .collect();
    let deleted = 0;
    for (const thread of threads) {
      if (thread.messageCount === 0 && thread._id !== keepThreadId) {
        await ctx.db.delete(thread._id);
        deleted++;
      }
    }
    return deleted;
  },
});
