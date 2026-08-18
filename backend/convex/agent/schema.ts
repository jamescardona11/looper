// Recording Assistant tables.
// Spread into your root convex/schema.ts:
//
//   import { agentTables } from "./agent/schema";
//   export default defineSchema({ ...authTables, ...agentTables, ... });
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const agentTables = {
  // Per-thread metadata. Messages live in `agentMessages` (one row per turn).
  agentThreads: defineTable({
    userId: v.id("users"),
    // Legacy component id retained only so existing rows remain schema-valid.
    componentThreadId: v.optional(v.string()),
    title: v.string(),
    archived: v.boolean(),
    pinned: v.boolean(),
    lastMessageAt: v.number(),
    messageCount: v.number(),
  }).index("by_user_recent", ["userId", "archived", "lastMessageAt"]),

  // Chat messages. Streaming assistant turns are written as a placeholder
  // first (status="streaming") then patched with chunks, then status="done".
  agentMessages: defineTable({
    threadId: v.id("agentThreads"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(v.union(v.literal("streaming"), v.literal("done"), v.literal("error"))),
    // JSON array of tool calls the assistant made, e.g. [{"name":"searchRecordings"}].
    // Rendered as a tool-call timeline in the chat UI.
    toolCalls: v.optional(v.string()),
    // Set by cancelGeneration; the streaming reply loop checks it and stops early.
    canceled: v.optional(v.boolean()),
    // Reasoning-model "thinking" text (o3 / o4-mini etc.), shown collapsed in the UI.
    reasoning: v.optional(v.string()),
    // User rating on an assistant reply (👍/👎) — feeds eval/quality dashboards.
    feedback: v.optional(v.union(v.literal("up"), v.literal("down"))),
    memoryScope: v.optional(
      v.union(
        v.literal("all"),
        v.literal("notes"),
        v.literal("dictations"),
        v.literal("meetings"),
      ),
    ),
    meetingId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_thread", ["threadId", "createdAt"]),

  // Token usage per request for cost tracking and rate limit accounting.
  // Aggregated by usage.ts queries for analytics.
  agentUsage: defineTable({
    userId: v.id("users"),
    threadId: v.id("agentThreads"),
    model: v.string(),
    provider: v.union(v.literal("openai"), v.literal("anthropic"), v.literal("google")),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    estimatedCostUsd: v.number(),
    durationMs: v.number(),
    toolCalls: v.number(),
    createdAt: v.number(),
  })
    .index("by_user_recent", ["userId", "createdAt"])
    .index("by_user_thread", ["userId", "threadId"])
    // Cross-user time-windowed scans for the admin spend dashboard.
    .index("by_created", ["createdAt"]),
};
