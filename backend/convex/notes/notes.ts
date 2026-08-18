import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 100_000;

function titleFor(value: string): string {
  const title = value.trim() || "Untitled note";
  if (title.length > MAX_TITLE_LENGTH) throw new Error("Title is too long");
  return title;
}

function bodyFor(value: string): string {
  if (value.length > MAX_BODY_LENGTH) throw new Error("Note is too long");
  return value;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("notes")
      .withIndex("by_user_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    kind: v.optional(v.union(v.literal("note"), v.literal("dictation"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const now = Date.now();
    return await ctx.db.insert("notes", {
      userId,
      kind: args.kind ?? "note",
      title: titleFor(args.title),
      body: bodyFor(args.body),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Idempotently migrates a device-owned note into the user's synced Library. */
export const upsertFromDevice = mutation({
  args: {
    sourceId: v.string(),
    kind: v.union(v.literal("note"), v.literal("dictation")),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const sourceId = args.sourceId.trim();
    if (!sourceId || sourceId.length > 200) throw new Error("Invalid source id");
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user_source", (q) => q.eq("userId", userId).eq("sourceId", sourceId))
      .unique();
    const value = {
      sourceId,
      kind: args.kind,
      title: titleFor(args.title),
      body: bodyFor(args.body),
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    };
    if (existing) {
      if (existing.updatedAt <= args.updatedAt) await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("notes", { userId, ...value });
  },
});

export const update = mutation({
  args: { id: v.id("notes"), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const note = await ctx.db.get(args.id);
    if (!note || note.userId !== userId) throw new Error("Note not found");
    await ctx.db.patch(args.id, {
      title: titleFor(args.title),
      body: bodyFor(args.body),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const note = await ctx.db.get(id);
    if (!note || note.userId !== userId) throw new Error("Note not found");
    await ctx.db.delete(id);
  },
});
