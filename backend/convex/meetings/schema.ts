import { defineTable } from "convex/server";
import { v } from "convex/values";

const transcriptStatus = v.union(v.literal("partial"), v.literal("final"));
const sessionState = v.union(v.literal("active"), v.literal("paused"), v.literal("ended"));
const contextKind = v.union(
  v.literal("text"),
  v.literal("document"),
  v.literal("image"),
  v.literal("link"),
  v.literal("note"),
);

/** Text-only companion data. Audio never enters these tables. */
export const meetingTables = {
  meetingSessions: defineTable({
    userId: v.id("users"),
    meetingId: v.string(),
    title: v.string(),
    sharingEnabled: v.boolean(),
    state: sessionState,
    nextSequence: v.number(),
    startedAt: v.number(),
    lastActiveAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_user_meeting", ["userId", "meetingId"])
    .index("by_user_activity", ["userId", "lastActiveAt"])
    .index("by_user_active", ["userId", "state", "lastActiveAt"]),

  meetingTranscriptSegments: defineTable({
    userId: v.id("users"),
    meetingId: v.string(),
    sequence: v.number(),
    timestampMs: v.number(),
    speaker: v.optional(v.string()),
    text: v.string(),
    status: transcriptStatus,
    createdAt: v.number(),
  }).index("by_user_meeting_sequence", ["userId", "meetingId", "sequence"]),

  meetingContexts: defineTable({
    userId: v.id("users"),
    meetingId: v.string(),
    kind: contextKind,
    title: v.string(),
    content: v.string(),
    sourceUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user_meeting_created", ["userId", "meetingId", "createdAt"]),

  // A presence heartbeat, not device tracking outside the active meeting.
  // It lets Desktop/Mobile expose connected companions without discovering
  // devices across accounts or retaining stale entries indefinitely.
  meetingCompanionDevices: defineTable({
    userId: v.id("users"),
    meetingId: v.string(),
    deviceId: v.string(),
    name: v.string(),
    lastActiveAt: v.number(),
  })
    .index("by_user_meeting", ["userId", "meetingId", "lastActiveAt"])
    .index("by_user_meeting_device", ["userId", "meetingId", "deviceId"]),

  // Markdown exports are explicitly reviewed before Desktop writes them.
  meetingOutputRequests: defineTable({
    userId: v.id("users"),
    meetingId: v.string(),
    preview: v.string(),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("cancelled")),
    // Optional so a schema rollout can deliver any already-confirmed output.
    deliveryStatus: v.optional(
      v.union(v.literal("pending"), v.literal("claimed"), v.literal("delivered")),
    ),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
    deliveryClaimId: v.optional(v.string()),
    deliveryClaimedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_user_meeting_created", ["userId", "meetingId", "createdAt"])
    .index("by_user_delivery", ["userId", "deliveryStatus"]),
};
