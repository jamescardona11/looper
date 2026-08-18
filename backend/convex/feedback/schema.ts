// In-app feedback submitted from the floating widget. Spread into the root
// schema via ...feedbackTables. Kept deliberately small: a rating, free text,
// the page it came from, and who sent it (null for anonymous visitors).
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const feedbackTables = {
  feedback: defineTable({
    userId: v.optional(v.id("users")),
    // "bug" | "idea" | "praise" | "other" — what kind of feedback this is.
    kind: v.union(v.literal("bug"), v.literal("idea"), v.literal("praise"), v.literal("other")),
    message: v.string(),
    // Route/path the widget was opened on, for triage context.
    path: v.optional(v.string()),
    // Optional sentiment 1–5 if the widget collects a rating.
    rating: v.optional(v.number()),
    status: v.union(v.literal("new"), v.literal("triaged"), v.literal("resolved")),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),
};
