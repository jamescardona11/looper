import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Durable, user-owned notes. Audio remains a transcription concern. */
export const notesTables = {
  notes: defineTable({
    userId: v.id("users"),
    sourceId: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("note"), v.literal("dictation"))),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_source", ["userId", "sourceId"]),
};
