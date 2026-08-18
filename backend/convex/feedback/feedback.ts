// In-app feedback: submit from the widget, list for admins.
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const MAX_MESSAGE = 4000;

export const submit = mutation({
  args: {
    kind: v.union(v.literal("bug"), v.literal("idea"), v.literal("praise"), v.literal("other")),
    message: v.string(),
    path: v.optional(v.string()),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, { kind, message, path, rating }) => {
    const trimmed = message.trim();
    if (!trimmed) throw new Error("Feedback message is required");
    if (trimmed.length > MAX_MESSAGE) throw new Error("Feedback is too long");

    // Anonymous feedback is allowed — userId is null for signed-out visitors.
    const userId = await getAuthUserId(ctx);

    await ctx.db.insert("feedback", {
      ...(userId ? { userId } : {}),
      kind,
      message: trimmed,
      ...(path ? { path } : {}),
      ...(rating !== undefined ? { rating } : {}),
      status: "new",
      createdAt: Date.now(),
    });
  },
});

// Admin-only triage list. Mirrors the gating used elsewhere in Looper:
// access is restricted to ADMIN_EMAILS (checked here at call time).
export const listForAdmin = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 100 }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (user as { email?: string } | null)?.email?.toLowerCase();
    if (!email || !adminEmails.includes(email)) return [];

    return await ctx.db
      .query("feedback")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .order("desc")
      .take(limit);
  },
});
