import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";

const MAX_TEXT_LENGTH = 20_000;
const MAX_CONTEXT_LENGTH = 100_000;
const MAX_PAGE_SIZE = 200;
const DEVICE_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const OUTPUT_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

const transcriptStatus = v.union(v.literal("partial"), v.literal("final"));
const sessionState = v.union(v.literal("active"), v.literal("paused"), v.literal("ended"));
const contextKind = v.union(
  v.literal("text"),
  v.literal("document"),
  v.literal("image"),
  v.literal("link"),
  v.literal("note"),
);

async function sessionFor(
  ctx: QueryCtx,
  userId: Id<"users">,
  meetingId: string,
): Promise<Doc<"meetingSessions"> | null> {
  return await ctx.db
    .query("meetingSessions")
    .withIndex("by_user_meeting", (q) => q.eq("userId", userId).eq("meetingId", meetingId))
    .unique();
}

function requiredText(value: string, label: string, maximum = MAX_TEXT_LENGTH): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) throw new Error(`${label} is too long`);
  return normalized;
}

/** Starts (or resumes) an explicitly text-sharing companion session. */
export const startSession = mutation({
  args: { meetingId: v.string(), title: v.string(), sharingEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const meetingId = requiredText(args.meetingId, "Meeting id", 200);
    const title = requiredText(args.title, "Title", 500);
    const now = Date.now();
    const existing = await sessionFor(ctx, userId, meetingId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        title,
        sharingEnabled: args.sharingEnabled,
        state: args.sharingEnabled ? "active" : "paused",
        lastActiveAt: now,
        endedAt: undefined,
      });
      return { meetingId, nextSequence: existing.nextSequence };
    }
    await ctx.db.insert("meetingSessions", {
      userId,
      meetingId,
      title,
      sharingEnabled: args.sharingEnabled,
      state: args.sharingEnabled ? "active" : "paused",
      nextSequence: 1,
      startedAt: now,
      lastActiveAt: now,
    });
    return { meetingId, nextSequence: 1 };
  },
});

/** Pause/stop is immediate: later transcript writes fail closed. */
export const setSessionState = mutation({
  args: { meetingId: v.string(), state: sessionState, sharingEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const session = await sessionFor(ctx, userId, requiredText(args.meetingId, "Meeting id", 200));
    if (!session) throw new Error("Meeting session not found");
    const now = Date.now();
    await ctx.db.patch(session._id, {
      state: args.state,
      sharingEnabled: args.sharingEnabled,
      lastActiveAt: now,
      ...(args.state === "ended" ? { endedAt: now } : {}),
    });
  },
});

/**
 * Ordered append protocol. The Desktop supplies the next cursor and the
 * backend rejects gaps/replays, which makes reconnect recovery deterministic.
 */
export const appendTranscript = mutation({
  args: {
    meetingId: v.string(),
    sequence: v.number(),
    timestampMs: v.number(),
    speaker: v.optional(v.string()),
    text: v.string(),
    status: transcriptStatus,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const meetingId = requiredText(args.meetingId, "Meeting id", 200);
    const text = requiredText(args.text, "Transcript text");
    const session = await sessionFor(ctx, userId, meetingId);
    if (!session?.sharingEnabled || session.state !== "active") {
      throw new Error("Live transcript sharing is not active for this meeting");
    }
    if (!Number.isSafeInteger(args.sequence) || args.sequence !== session.nextSequence) {
      throw new Error(`Expected transcript sequence ${session.nextSequence}`);
    }
    if (!Number.isFinite(args.timestampMs) || args.timestampMs < 0) {
      throw new Error("Timestamp is invalid");
    }
    const now = Date.now();
    await ctx.db.insert("meetingTranscriptSegments", {
      userId,
      meetingId,
      sequence: args.sequence,
      timestampMs: args.timestampMs,
      speaker: args.speaker?.trim() || undefined,
      text,
      status: args.status,
      createdAt: now,
    });
    await ctx.db.patch(session._id, { nextSequence: args.sequence + 1, lastActiveAt: now });
    return { nextSequence: args.sequence + 1 };
  },
});

export const listActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("meetingSessions")
      .withIndex("by_user_active", (q) => q.eq("userId", userId).eq("state", "active"))
      .order("desc")
      .collect();
  },
});

/** Recent meetings for Library, including completed and paused sessions. */
export const listSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const safeLimit = Math.min(Math.max(limit ?? 50, 1), MAX_PAGE_SIZE);
    return await ctx.db
      .query("meetingSessions")
      .withIndex("by_user_activity", (q) => q.eq("userId", userId))
      .order("desc")
      .take(safeLimit);
  },
});

export const getSession = query({
  args: { meetingId: v.string() },
  handler: async (ctx, { meetingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await sessionFor(ctx, userId, meetingId.trim());
  },
});

export const getTranscriptSince = query({
  args: { meetingId: v.string(), afterSequence: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { meetingId, afterSequence, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { segments: [], nextSequence: afterSequence };
    const safeLimit = Math.min(Math.max(limit ?? 100, 1), MAX_PAGE_SIZE);
    const segments = await ctx.db
      .query("meetingTranscriptSegments")
      .withIndex("by_user_meeting_sequence", (q) =>
        q.eq("userId", userId).eq("meetingId", meetingId.trim()).gt("sequence", afterSequence),
      )
      .take(safeLimit);
    return { segments, nextSequence: segments.at(-1)?.sequence ?? afterSequence };
  },
});

export const addContext = mutation({
  args: {
    meetingId: v.string(),
    kind: contextKind,
    title: v.string(),
    content: v.string(),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const meetingId = requiredText(args.meetingId, "Meeting id", 200);
    if (!(await sessionFor(ctx, userId, meetingId))) throw new Error("Meeting session not found");
    return await ctx.db.insert("meetingContexts", {
      userId,
      meetingId,
      kind: args.kind,
      title: requiredText(args.title, "Context title", 500),
      content: requiredText(args.content, "Context", MAX_CONTEXT_LENGTH),
      sourceUrl: args.sourceUrl?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const listContexts = query({
  args: { meetingId: v.string() },
  handler: async (ctx, { meetingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("meetingContexts")
      .withIndex("by_user_meeting_created", (q) =>
        q.eq("userId", userId).eq("meetingId", meetingId.trim()),
      )
      .order("desc")
      .collect();
  },
});

export const registerCompanionDevice = mutation({
  args: { meetingId: v.string(), deviceId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const meetingId = requiredText(args.meetingId, "Meeting id", 200);
    if (!(await sessionFor(ctx, userId, meetingId))) throw new Error("Meeting session not found");
    const deviceId = requiredText(args.deviceId, "Device id", 200);
    const name = requiredText(args.name, "Device name", 200);
    const existing = await ctx.db
      .query("meetingCompanionDevices")
      .withIndex("by_user_meeting_device", (q) =>
        q.eq("userId", userId).eq("meetingId", meetingId).eq("deviceId", deviceId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name, lastActiveAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("meetingCompanionDevices", {
      userId,
      meetingId,
      deviceId,
      name,
      lastActiveAt: Date.now(),
    });
  },
});

export const listConnectedDevices = query({
  args: { meetingId: v.string() },
  handler: async (ctx, { meetingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const threshold = Date.now() - DEVICE_ACTIVE_WINDOW_MS;
    const devices = await ctx.db
      .query("meetingCompanionDevices")
      .withIndex("by_user_meeting", (q) => q.eq("userId", userId).eq("meetingId", meetingId.trim()))
      .collect();
    return devices.filter((device) => device.lastActiveAt >= threshold);
  },
});

/** Deterministic first assistant pass; clients may send this evidence to their configured LLM. */
export const getMeetingBrief = query({
  args: { meetingId: v.string() },
  handler: async (ctx, { meetingId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { decisions: [], tasks: [], questions: [], contextCount: 0 };
    const id = meetingId.trim();
    const segments = await ctx.db
      .query("meetingTranscriptSegments")
      .withIndex("by_user_meeting_sequence", (q) => q.eq("userId", userId).eq("meetingId", id))
      .take(MAX_PAGE_SIZE);
    const contexts = await ctx.db
      .query("meetingContexts")
      .withIndex("by_user_meeting_created", (q) => q.eq("userId", userId).eq("meetingId", id))
      .collect();
    const lines = segments.map((segment) => segment.text);
    const takeMatches = (pattern: RegExp) =>
      lines.filter((line) => pattern.test(line)).slice(0, 20);
    return {
      decisions: takeMatches(
        /\b(decision\w*|decid\w*|agree\w*|approved|we will|vamos a|acordamos)\b/i,
      ),
      tasks: takeMatches(/\b(todo|action item|follow up|owner|task|tarea|pendiente)\b/i),
      questions: takeMatches(/\?|\b(question|pregunta|duda)\b/i),
      contextCount: contexts.length,
    };
  },
});

/** Cross-meeting Memory search over transcript evidence and attached contexts. */
export const searchMeetingMemory = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: rawQuery, limit }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const needle = requiredText(rawQuery, "Search query", 500).toLocaleLowerCase();
    const safeLimit = Math.min(Math.max(limit ?? 25, 1), 100);
    const sessions = await ctx.db
      .query("meetingSessions")
      .withIndex("by_user_active", (q) => q.eq("userId", userId))
      .collect();
    const results: Array<{
      meetingId: string;
      title: string;
      kind: "transcript" | "context";
      text: string;
      sequence?: number;
    }> = [];
    for (const session of sessions) {
      if (results.length >= safeLimit) break;
      const [segments, contexts] = await Promise.all([
        ctx.db
          .query("meetingTranscriptSegments")
          .withIndex("by_user_meeting_sequence", (q) =>
            q.eq("userId", userId).eq("meetingId", session.meetingId),
          )
          .take(MAX_PAGE_SIZE),
        ctx.db
          .query("meetingContexts")
          .withIndex("by_user_meeting_created", (q) =>
            q.eq("userId", userId).eq("meetingId", session.meetingId),
          )
          .take(MAX_PAGE_SIZE),
      ]);
      for (const segment of segments) {
        if (segment.text.toLocaleLowerCase().includes(needle)) {
          results.push({
            meetingId: session.meetingId,
            title: session.title,
            kind: "transcript",
            text: segment.text,
            sequence: segment.sequence,
          });
          if (results.length >= safeLimit) return results;
        }
      }
      for (const context of contexts) {
        if (`${context.title}\n${context.content}`.toLocaleLowerCase().includes(needle)) {
          results.push({
            meetingId: session.meetingId,
            title: session.title,
            kind: "context",
            text: context.content,
          });
          if (results.length >= safeLimit) return results;
        }
      }
    }
    return results;
  },
});

/**
 * A read-only answer substrate for Mobile. It deliberately returns evidence,
 * not an unconstrained chat answer: a configured LLM can summarize these same
 * citations later without gaining access to a different meeting or account.
 */
export const askMeeting = query({
  args: { meetingId: v.string(), question: v.string() },
  handler: async (ctx, { meetingId, question }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { answer: "Sign in to ask about this meeting.", evidence: [] };
    const id = requiredText(meetingId, "Meeting id", 200);
    const terms = requiredText(question, "Question", 500)
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2)
      .slice(0, 12);
    const [segments, contexts] = await Promise.all([
      ctx.db
        .query("meetingTranscriptSegments")
        .withIndex("by_user_meeting_sequence", (q) => q.eq("userId", userId).eq("meetingId", id))
        .take(MAX_PAGE_SIZE),
      ctx.db
        .query("meetingContexts")
        .withIndex("by_user_meeting_created", (q) => q.eq("userId", userId).eq("meetingId", id))
        .take(MAX_PAGE_SIZE),
    ]);
    const evidence = [
      ...segments.map((segment) => ({
        label: `Transcript #${segment.sequence}`,
        text: segment.text,
      })),
      ...contexts.map((context) => ({ label: `Context: ${context.title}`, text: context.content })),
    ]
      .filter(
        (item) =>
          terms.length === 0 || terms.some((term) => item.text.toLocaleLowerCase().includes(term)),
      )
      .slice(0, 8);
    return {
      answer: evidence.length
        ? "I found evidence in this meeting. Review the cited excerpts below."
        : "I could not find matching evidence in this meeting.",
      evidence,
    };
  },
});

export const prepareMarkdownOutput = mutation({
  args: { meetingId: v.string(), preview: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const meetingId = requiredText(args.meetingId, "Meeting id", 200);
    if (!(await sessionFor(ctx, userId, meetingId))) throw new Error("Meeting session not found");
    return await ctx.db.insert("meetingOutputRequests", {
      userId,
      meetingId,
      preview: requiredText(args.preview, "Output preview", MAX_CONTEXT_LENGTH),
      status: "pending",
      deliveryStatus: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Gives one Desktop process exclusive, short-lived ownership of a confirmed
 * Markdown export. The claim is reclaimed after a crash so confirmation never
 * silently loses a user-approved file.
 */
export const claimConfirmedMarkdownOutput = mutation({
  args: { claimId: v.string() },
  handler: async (ctx, { claimId: rawClaimId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const claimId = requiredText(rawClaimId, "Claim id", 200);
    const now = Date.now();
    const candidates = await ctx.db
      .query("meetingOutputRequests")
      .withIndex("by_user_delivery", (q) => q.eq("userId", userId))
      .order("asc")
      .collect();
    const output = candidates.find(
      (candidate) =>
        candidate.status === "confirmed" &&
        ((candidate.deliveryStatus ?? "pending") === "pending" ||
          (candidate.deliveryStatus === "claimed" &&
            (candidate.deliveryClaimedAt ?? 0) + OUTPUT_CLAIM_TIMEOUT_MS <= now)),
    );
    if (!output) return null;
    await ctx.db.patch(output._id, {
      deliveryStatus: "claimed",
      deliveryClaimId: claimId,
      deliveryClaimedAt: now,
    });
    return { outputId: output._id, meetingId: output.meetingId, preview: output.preview };
  },
});

/** Marks a claimed local Markdown delivery complete. */
export const completeMarkdownOutputDelivery = mutation({
  args: { outputId: v.id("meetingOutputRequests"), claimId: v.string(), delivered: v.boolean() },
  handler: async (ctx, { outputId, claimId: rawClaimId, delivered }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const output = await ctx.db.get(outputId);
    if (!output || output.userId !== userId) {
      throw new Error("Markdown output request not found");
    }
    const claimId = requiredText(rawClaimId, "Claim id", 200);
    if (output.deliveryStatus !== "claimed" || output.deliveryClaimId !== claimId) {
      throw new Error("Markdown output is not claimed by this delivery");
    }
    await ctx.db.patch(
      output._id,
      delivered
        ? { deliveryStatus: "delivered", deliveredAt: Date.now() }
        : { deliveryStatus: "pending", deliveryClaimId: undefined, deliveryClaimedAt: undefined },
    );
  },
});

export const confirmMarkdownOutput = mutation({
  args: { outputId: v.id("meetingOutputRequests"), approved: v.boolean() },
  handler: async (ctx, { outputId, approved }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const output = await ctx.db.get(outputId);
    if (!output || output.userId !== userId) throw new Error("Output request not found");
    if (output.status !== "pending") return { status: output.status };
    const status = approved ? "confirmed" : "cancelled";
    await ctx.db.patch(output._id, { status, ...(approved ? { confirmedAt: Date.now() } : {}) });
    return { status };
  },
});
