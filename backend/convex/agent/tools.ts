// Tool registry for the AI agent. Uses AI SDK v6 format (`tool()` + `inputSchema`).
// The agent calls these during text generation when tools are enabled
// (all tiers, within their configured message limits — see reply.ts gating).

import { tool } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { z } from "zod";
const DEFAULT_MEMORY_LIMIT = 8;
const MAX_MEMORY_LIMIT = 20;
const MAX_MEMORY_QUERY_CHARS = 256;
const MAX_MEMORY_QUERY_TERMS = 16;
const MAX_MEMORY_TEXT_CHARS = 800;

type MemoryResult = {
  id: string;
  kind: "note" | "dictation" | "meeting";
  title: string;
  text: string;
  occurredAt: number;
};
const memoryKind = v.union(v.literal("note"), v.literal("dictation"), v.literal("meeting"));
const memoryKindSchema = z.enum(["note", "dictation", "meeting"]);

export function buildTools(ctx: ActionCtx, userId: Id<"users">) {
  const internalApi = internal as any;

  return {
    searchLooperMemory: tool({
      description:
        "Search the user's private Looper memory across synced notes, text-only dictations, meeting transcripts, and meeting notes. Use an empty query to list recent items inside the requested kinds or meetingId scope. Use only when the user explicitly asks to recall, compare, summarize, or reuse saved content. This cannot access unsynced local data or audio.",
      inputSchema: z.object({
        query: z.string().trim().max(MAX_MEMORY_QUERY_CHARS).default(""),
        limit: z.number().optional(),
        kinds: z.array(memoryKindSchema).optional(),
        meetingId: z.string().trim().max(200).optional(),
      }),
      execute: async ({ query, limit = DEFAULT_MEMORY_LIMIT, kinds, meetingId }) =>
        await ctx.runQuery(internalApi.agent.tools._searchLooperMemory, {
          userId,
          query,
          limit,
          kinds,
          meetingId,
        }),
    }),
  };
}

/** Private cross-surface retrieval used by the Agent. Audio never enters this index. */
export const _searchLooperMemory = internalQuery({
  args: {
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
    kinds: v.optional(v.array(memoryKind)),
    meetingId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, query, limit, kinds, meetingId }) => {
    const terms = normalizedTerms(query);
    const cappedLimit = normalizedLimit(limit);
    const selectedKinds = new Set(kinds ?? ["note", "dictation", "meeting"]);
    const [notes, dictations, meetings] = await Promise.all([
      selectedKinds.has("note")
        ? ctx.db
            .query("notes")
            .withIndex("by_user_updated", (q) => q.eq("userId", userId))
            .order("desc")
            .take(100)
        : [],
      selectedKinds.has("dictation")
        ? ctx.db
            .query("transcriptions")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .take(100)
        : [],
      selectedKinds.has("meeting")
        ? ctx.db
            .query("meetingSessions")
            .withIndex("by_user_activity", (q) => q.eq("userId", userId))
            .order("desc")
            .take(50)
        : [],
    ]);
    const results: MemoryResult[] = [];

    for (const note of notes) {
      if (matchesTerms(`${note.title}\n${note.body}`, terms)) {
        results.push({
          id: note._id,
          kind: "note",
          title: note.title,
          text: excerpt(note.body || note.title),
          occurredAt: note.updatedAt,
        });
      }
    }
    for (const dictation of dictations) {
      if (matchesTerms(dictation.text, terms)) {
        results.push({
          id: dictation._id,
          kind: "dictation",
          title: "Dictation",
          text: excerpt(dictation.text),
          occurredAt: dictation.occurredAt ?? dictation.createdAt,
        });
      }
    }
    for (const meeting of meetings) {
      if (meetingId && meeting.meetingId !== meetingId) continue;
      if (results.length >= cappedLimit * 3) break;
      const [segments, contexts] = await Promise.all([
        ctx.db
          .query("meetingTranscriptSegments")
          .withIndex("by_user_meeting_sequence", (q) =>
            q.eq("userId", userId).eq("meetingId", meeting.meetingId),
          )
          .take(200),
        ctx.db
          .query("meetingContexts")
          .withIndex("by_user_meeting_created", (q) =>
            q.eq("userId", userId).eq("meetingId", meeting.meetingId),
          )
          .take(100),
      ]);
      const matchingText = [
        meeting.title,
        ...segments.map((segment) => segment.text),
        ...contexts.map((context) => `${context.title}\n${context.content}`),
      ].filter((value) => matchesTerms(value, terms));
      if (matchingText.length > 0) {
        results.push({
          id: meeting.meetingId,
          kind: "meeting",
          title: meeting.title,
          text: excerpt(matchingText.join("\n")),
          occurredAt: meeting.lastActiveAt,
        });
      }
    }

    return results.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, cappedLimit);
  },
});

function normalizedTerms(query: string): string[] {
  return query
    .trim()
    .slice(0, MAX_MEMORY_QUERY_CHARS)
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2)
    .slice(0, MAX_MEMORY_QUERY_TERMS);
}

function normalizedLimit(limit: number | undefined): number {
  const value = typeof limit === "number" && Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_MEMORY_LIMIT;
  return Math.max(1, Math.min(value, MAX_MEMORY_LIMIT));
}

function matchesTerms(value: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const normalized = value.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function excerpt(value: string): string {
  const normalized = value.trim();
  return normalized.length > MAX_MEMORY_TEXT_CHARS
    ? `${normalized.slice(0, MAX_MEMORY_TEXT_CHARS - 1)}…`
    : normalized;
}
