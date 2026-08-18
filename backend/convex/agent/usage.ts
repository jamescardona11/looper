// Token usage tracking + cost analytics.
// Logged by agent.ts on every request; queried by clients for usage and quota display.

import { getAuthUserId } from "@convex-dev/auth/server";
import { estimateCost, MODELS } from "@looper/config/agent";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "../_generated/server";

export const logUsage = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.id("agentThreads"),
    model: v.string(),
    provider: v.union(v.literal("openai"), v.literal("anthropic"), v.literal("google")),
    promptTokens: v.number(),
    completionTokens: v.number(),
    durationMs: v.number(),
    toolCalls: v.number(),
  },
  handler: async (ctx, args) => {
    // This module OWNS cost. Callers report raw token counts and the model id —
    // never a price. A caller can no longer record a wrong (or zero) cost: the
    // rates are looked up here from the model id. Unknown id → 0 (no rate entry).
    const cfg = MODELS[args.model];
    const estimatedCostUsd = cfg ? estimateCost(args.promptTokens, args.completionTokens, cfg) : 0;
    await ctx.db.insert("agentUsage", {
      ...args,
      totalTokens: args.promptTokens + args.completionTokens,
      estimatedCostUsd,
      createdAt: Date.now(),
    });
  },
});

// Public query: this month's usage summary.
export const monthlyUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const sinceMs = startOfMonth.getTime();

    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).gte("createdAt", sinceMs))
      .collect();

    return {
      messages: rows.length,
      totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
      estimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
      byModel: aggregateByModel(rows),
    };
  },
});

// Public query: this calendar month's usage for the user-facing usage dashboard.
// Same window as monthlyUsage but the explicit name the /usage page binds to.
export const userUsageThisMonth = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const sinceMs = startOfMonth.getTime();

    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).gte("createdAt", sinceMs))
      .collect();

    return {
      messages: rows.length,
      totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
      estimatedCostUsd: rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
      byModel: aggregateByModel(rows),
    };
  },
});

// Public query: today's usage for rate limit display
export const todayUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_user_recent", (q) =>
        q.eq("userId", userId).gte("createdAt", startOfDay.getTime()),
      )
      .collect();

    return {
      messages: rows.length,
      totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
    };
  },
});

// Public query: per-day usage time series for the usage dashboard charts.
// Scans this user's rows since now - days and buckets them by local calendar
// day. Feeds the 14-day area/line, the daily message bars (today highlighted),
// the by-model donut, and the 7d-vs-7d trend deltas (computed client-side).
const DAY_MS = 24 * 60 * 60 * 1000;

export const dailyUsage = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const window = Math.max(1, Math.min(days ?? 14, 90));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sinceMs = startOfToday.getTime() - (window - 1) * DAY_MS;

    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).gte("createdAt", sinceMs))
      .collect();

    // Pre-seed every day in the window so gaps render as zero, not as missing
    // points (keeps the x-axis continuous for the charts).
    const buckets = new Map<
      number,
      { dateMs: number; messages: number; totalTokens: number; estimatedCostUsd: number }
    >();
    for (let i = 0; i < window; i++) {
      const dateMs = sinceMs + i * DAY_MS;
      buckets.set(dateMs, { dateMs, messages: 0, totalTokens: 0, estimatedCostUsd: 0 });
    }

    for (const r of rows) {
      const d = new Date(r.createdAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.messages += 1;
      bucket.totalTokens += r.totalTokens;
      bucket.estimatedCostUsd += r.estimatedCostUsd;
    }

    return {
      days: window,
      series: Array.from(buckets.values()).sort((a, b) => a.dateMs - b.dateMs),
      byModel: aggregateByModel(rows),
    };
  },
});

// Internal helper used by agent.ts for rate limit check (stub path; the real one uses
// @convex-dev/rate-limiter)
export const countSince = internalQuery({
  args: { userId: v.id("users"), sinceMs: v.number() },
  handler: async (ctx, { userId, sinceMs }) => {
    const rows = await ctx.db
      .query("agentUsage")
      .withIndex("by_user_recent", (q) => q.eq("userId", userId).gte("createdAt", sinceMs))
      .collect();
    return rows.length;
  },
});

function aggregateByModel(
  rows: Array<{ model: string; totalTokens: number; estimatedCostUsd: number }>,
) {
  const map = new Map<string, { messages: number; tokens: number; cost: number }>();
  for (const r of rows) {
    const existing = map.get(r.model) ?? { messages: 0, tokens: 0, cost: 0 };
    existing.messages++;
    existing.tokens += r.totalTokens;
    existing.cost += r.estimatedCostUsd;
    map.set(r.model, existing);
  }
  return Object.fromEntries(map);
}
