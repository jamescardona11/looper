// Admin-only queries and mutations.
//
// Admin check strategy (evaluated as OR — all sources checked):
//   1. ADMIN_EMAILS env var — comma-separated emails that are always admin.
//   2. adminUsers table — DB-managed grants via promoteToAdmin/demoteFromAdmin.
// There is deliberately no bootstrap fallback (deny-by-default): set ADMIN_EMAILS
// before exposing the deployment, otherwise no one is admin.
//
// "Active in last 7 days" uses authSessions._creationTime as proxy — a session
// created recently means the user authenticated recently.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { env } from "./env";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function requireAdmin(ctx: any): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");

  // Source 1: ADMIN_EMAILS env var
  const adminEmails = env.ADMIN_EMAILS;
  const emailList = adminEmails
    ? adminEmails
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [];
  if (emailList.length > 0 && user.email && emailList.includes(user.email)) {
    return userId;
  }

  // Source 2: adminUsers table (DB-managed)
  const dbGrant = await ctx.db
    .query("adminUsers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (dbGrant) return userId;

  // Deny by default. There is intentionally NO "first user is admin" bootstrap:
  // a fresh deployment exposed publicly before the owner signs up would let an
  // attacker self-register as admin. Set ADMIN_EMAILS before going public, then
  // promote others via promoteToAdmin.
  throw new Error("Access denied");
}

// Returns true if the current caller is admin. Never throws — safe for UI guards.
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    try {
      await requireAdmin(ctx);
      return true;
    } catch {
      return false;
    }
  },
});

// Grants admin rights to a user by userId. Requires caller to already be admin.
export const promoteToAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const target = await ctx.db.get(userId);
    if (!target) throw new Error("User not found");

    // Idempotent — no-op if already granted
    const existing = await ctx.db
      .query("adminUsers")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first();
    if (!existing) {
      await ctx.db.insert("adminUsers", { userId });
    }
  },
});

// Removes admin rights from a user. Requires caller to already be admin.
// Refuses to demote the last DB-managed admin when ADMIN_EMAILS is also empty,
// which would permanently lock everyone out.
export const demoteFromAdmin = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const grant = await ctx.db
      .query("adminUsers")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first();

    if (!grant) {
      // Nothing to demote from DB — user may still be admin via ADMIN_EMAILS.
      return;
    }

    // Safety check: refuse to remove the last admin when no email fallback exists.
    const emailList = (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    const allDbAdmins = await ctx.db.query("adminUsers").collect();
    if (allDbAdmins.length === 1 && emailList.length === 0) {
      throw new Error(
        "Cannot demote the last admin — set ADMIN_EMAILS first or promote another user.",
      );
    }

    await ctx.db.delete(grant._id);
  },
});

export const getUserCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.length;
  },
});

export const getActiveUserCount = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const recentSessions = await ctx.db
      .query("authSessions")
      .filter((q: any) => q.gte(q.field("_creationTime"), cutoff))
      .collect();
    // Deduplicate by userId to count unique active users
    const uniqueUserIds = new Set(recentSessions.map((s: any) => s.userId));
    return uniqueUserIds.size;
  },
});

export const getSubscriptionStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const subs = await ctx.db.query("userSubscriptions").collect();
    const counts = { free: 0, pro: 0, ultra: 0 };
    for (const sub of subs) {
      if (sub.tier === "pro") counts.pro += 1;
      else if (sub.tier === "ultra") counts.ultra += 1;
      else counts.free += 1;
    }
    // Users without a subscription row default to free
    const totalUsers = (await ctx.db.query("users").collect()).length;
    counts.free += totalUsers - subs.length;
    return counts;
  },
});

function startOfMonthMs(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Aggregate AI token usage + estimated cost across ALL users for a time window
// (defaults to the current calendar month). Powers the admin spend dashboard.
export const getUsageStats = query({
  args: { sinceMs: v.optional(v.number()) },
  handler: async (ctx, { sinceMs }) => {
    await requireAdmin(ctx);
    const since = sinceMs ?? startOfMonthMs();
    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_created", (q: any) => q.gte("createdAt", since))
      .collect();

    let promptTokens = 0;
    let completionTokens = 0;
    let estimatedCostUsd = 0;
    for (const r of rows) {
      promptTokens += r.promptTokens;
      completionTokens += r.completionTokens;
      estimatedCostUsd += r.estimatedCostUsd;
    }
    return {
      sinceMs: since,
      messages: rows.length,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd,
    };
  },
});

// Per-user AI spend breakdown for the same window, sorted by cost desc (top N).
// One scan of the window + a join to users for display names.
export const getUsageByUser = query({
  args: { sinceMs: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      userId: v.string(),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      messages: v.number(),
      totalTokens: v.number(),
      estimatedCostUsd: v.number(),
    }),
  ),
  handler: async (ctx, { sinceMs, limit }) => {
    await requireAdmin(ctx);
    const since = sinceMs ?? startOfMonthMs();
    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_created", (q: any) => q.gte("createdAt", since))
      .collect();

    const byUser = new Map<
      string,
      { messages: number; totalTokens: number; estimatedCostUsd: number }
    >();
    for (const r of rows) {
      const key = r.userId as string;
      const agg = byUser.get(key) ?? { messages: 0, totalTokens: 0, estimatedCostUsd: 0 };
      agg.messages += 1;
      agg.totalTokens += r.totalTokens;
      agg.estimatedCostUsd += r.estimatedCostUsd;
      byUser.set(key, agg);
    }

    const entries = await Promise.all(
      [...byUser.entries()].map(async ([userId, agg]) => {
        const user = await ctx.db.get(userId as Id<"users">);
        return { userId, name: user?.name ?? null, email: user?.email ?? null, ...agg };
      }),
    );
    entries.sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
    return entries.slice(0, limit ?? 20);
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").order("desc").collect();

    const subByUser = new Map<string, any>();
    // Fetch all subscriptions once and index by userId for O(1) lookup.
    const allSubs = await ctx.db.query("userSubscriptions").collect();
    for (const sub of allSubs) subByUser.set(sub.userId, sub);

    // Determine "active in last 7 days" per user via authSessions
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const recentSessions = await ctx.db
      .query("authSessions")
      .filter((q: any) => q.gte(q.field("_creationTime"), cutoff))
      .collect();
    const activeUserIds = new Set(recentSessions.map((s: any) => s.userId));

    return users.map((user: any) => {
      const sub = subByUser.get(user._id);
      return {
        id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        tier: (sub?.tier ?? "free") as "free" | "pro" | "ultra",
        subscriptionStatus: sub?.status ?? "none",
        joinedAt: user._creationTime,
        isActive: activeUserIds.has(user._id),
      };
    });
  },
});

// Returns a user's profile for admin review. Named "impersonateUser" per spec
// but performs no session switching — only data viewing.
// Note: spec requested an action, but actions cannot read the database.
// A query is the correct shape for "view user data". [Rule 1 auto-fix]
export const impersonateUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const user = await ctx.db
      .query("users")
      .filter((q: any) => q.eq(q.field("_id"), userId))
      .first();
    if (!user) throw new Error("User not found");

    const subscription = {
      tier: "free" as "free" | "pro" | "ultra",
      status: "none",
    };
    const sub = await ctx.db
      .query("userSubscriptions")
      .withIndex("by_user", (q: any) => q.eq("userId", userId as Id<"users">))
      .first();
    subscription.tier = (sub?.tier ?? "free") as "free" | "pro" | "ultra";
    subscription.status = sub?.status ?? "none";

    return {
      id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      isAnonymous: Boolean(user.isAnonymous),
      tier: subscription.tier,
      subscriptionStatus: subscription.status,
      joinedAt: user._creationTime,
    };
  },
});
