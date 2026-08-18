import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";

// List the messages of a thread, oldest → newest.
// Reactive: the chat UI re-renders as the streaming row is patched.
export const list = query({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) return [];
    return await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .collect();
  },
});

// Append a user turn. Called from the client before kicking off streaming.
export const addUserMessage = mutation({
  args: {
    threadId: v.id("agentThreads"),
    content: v.string(),
    memoryScope: v.optional(
      v.union(v.literal("all"), v.literal("notes"), v.literal("dictations"), v.literal("meetings")),
    ),
    meetingId: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, content, memoryScope, meetingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Thread not found");

    // Enforce per-tier daily quota before persisting. Throws with a
    // user-readable message that the client surfaces in the composer. The
    // consumeCreditKey makes this the authoritative gate: if the daily limit is
    // hit, one credit is deducted (idempotently) from the consumable balance.
    await ctx.runMutation(internal.agent.credits.assertWithinLimit, {
      userId,
      consumeCreditKey: crypto.randomUUID(),
    });

    const id = await ctx.db.insert("agentMessages", {
      threadId,
      userId,
      role: "user",
      content,
      status: "done",
      ...(memoryScope ? { memoryScope } : {}),
      ...(meetingId ? { meetingId } : {}),
      createdAt: Date.now(),
    });
    await ctx.db.patch(threadId, {
      lastMessageAt: Date.now(),
      messageCount: thread.messageCount + 1,
    });

    // Fire-and-forget: schedule the AI reply. The reactive query will surface
    // the assistant placeholder as it appears, then the final content when done.
    await ctx.scheduler.runAfter(0, internal.agent.reply.replyToThread, {
      threadId,
      userId,
    });

    return id;
  },
});

// Regenerate the assistant's last reply: delete the latest assistant message and
// re-run the model against the existing history (the user turn stays). Does not
// consume a new credit (the original send already paid).
export const regenerateLast = mutation({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Thread not found");

    const recent = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(20);
    const lastAssistant = recent.find((m) => m.role === "assistant");
    if (lastAssistant) await ctx.db.delete(lastAssistant._id);

    await ctx.scheduler.runAfter(0, internal.agent.reply.replyToThread, { threadId, userId });
  },
});

// Rate an assistant reply 👍/👎 (feeds eval dashboards). Clicking the same
// rating again clears it.
export const rateMessage = mutation({
  args: {
    messageId: v.id("agentMessages"),
    rating: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { messageId, rating }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message not found");
    const thread = await ctx.db.get(msg.threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not allowed");
    await ctx.db.patch(messageId, { feedback: msg.feedback === rating ? undefined : rating });
  },
});

// Edit a user message and re-run: update its text, drop every message after it
// (the now-stale replies), and re-generate the assistant turn.
export const editUserMessage = mutation({
  args: { messageId: v.id("agentMessages"), content: v.string() },
  handler: async (ctx, { messageId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const msg = await ctx.db.get(messageId);
    if (!msg || msg.role !== "user") throw new Error("Can only edit your own messages");
    const thread = await ctx.db.get(msg.threadId);
    if (!thread || thread.userId !== userId) throw new Error("Not allowed");

    await ctx.db.patch(messageId, { content });

    const all = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", msg.threadId))
      .order("asc")
      .collect();
    const idx = all.findIndex((m) => m._id === messageId);
    for (const m of all.slice(idx + 1)) await ctx.db.delete(m._id);

    await ctx.scheduler.runAfter(0, internal.agent.reply.replyToThread, {
      threadId: msg.threadId,
      userId,
    });
  },
});

// Internal: insert assistant placeholder row. Streaming handler patches it.
export const createAssistantPlaceholder = internalMutation({
  args: { threadId: v.id("agentThreads"), userId: v.id("users") },
  handler: async (ctx, { threadId, userId }) => {
    return await ctx.db.insert("agentMessages", {
      threadId,
      userId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: Date.now(),
    });
  },
});

// Internal: patch assistant row with accumulated content (called per chunk).
// Returns whether the user requested cancellation, so the reply loop can stop
// without an extra query.
export const appendAssistantChunk = internalMutation({
  args: { messageId: v.id("agentMessages"), content: v.string() },
  handler: async (ctx, { messageId, content }) => {
    await ctx.db.patch(messageId, { content });
    const msg = await ctx.db.get(messageId);
    return { canceled: msg?.canceled === true };
  },
});

// Stop an in-flight generation: marks the streaming assistant message canceled.
// The reply loop sees the flag on its next chunk patch and finalizes early.
export const cancelGeneration = mutation({
  args: { threadId: v.id("agentThreads") },
  handler: async (ctx, { threadId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const thread = await ctx.db.get(threadId);
    if (!thread || thread.userId !== userId) throw new Error("Thread not found");
    const recent = await ctx.db
      .query("agentMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(5);
    const streaming = recent.find((m) => m.role === "assistant" && m.status === "streaming");
    if (streaming) await ctx.db.patch(streaming._id, { canceled: true });
  },
});

// Internal: mark assistant row as done (or errored).
export const finalizeAssistantMessage = internalMutation({
  args: {
    messageId: v.id("agentMessages"),
    status: v.union(v.literal("done"), v.literal("error")),
    finalContent: v.optional(v.string()),
    toolCalls: v.optional(v.string()),
    reasoning: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, status, finalContent, toolCalls, reasoning }) => {
    const patch: Record<string, unknown> = { status };
    if (finalContent !== undefined) patch.content = finalContent;
    if (toolCalls !== undefined) patch.toolCalls = toolCalls;
    if (reasoning !== undefined) patch.reasoning = reasoning;
    await ctx.db.patch(messageId, patch);
    const msg = await ctx.db.get(messageId);
    if (msg) {
      const thread = await ctx.db.get(msg.threadId);
      if (thread) {
        await ctx.db.patch(msg.threadId, {
          lastMessageAt: Date.now(),
          messageCount: thread.messageCount + 1,
        });
      }
    }
  },
});
