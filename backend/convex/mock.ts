// Per-user mock mode.
//
// `isMockMode()` (env.ts) is the GLOBAL switch: when the MOCK_MODE env var is on,
// every user gets deterministic provider responses (local development and CI). This
// module adds a PER-USER layer on top, toggled from Settings → Developer, so a
// single tester can try the product keyless without flipping a deployment env var.
//
// Effective flag = global env OR the user's own opt-in row in `userMockMode`.
// Provider-backed actions (Recording Assistant and STT) read it via `mockEnabledFor`.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, type QueryCtx, query } from "./_generated/server";
import { isMockMode } from "./env";

async function hasMockRow(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const row = await ctx.db
    .query("userMockMode")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return row !== null;
}

export async function isMockEnabledForUser(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  return isMockMode() || (await hasMockRow(ctx, userId));
}

// Internal: the effective mock flag for a user (env OR their own opt-in). Called
// by generation actions via ctx.runQuery, since actions have no direct db access.
export const mockEnabledFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await isMockEnabledForUser(ctx, userId);
  },
});

// The current user's mock state for the Settings switch. `forced` means the env
// has it on globally, so the UI shows the switch on and locked.
export const getMockMode = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { enabled: false, forced: false };
    const forced = isMockMode();
    return { enabled: forced || (await hasMockRow(ctx, userId)), forced };
  },
});

// Toggle this user's mock opt-in. While the env forces mock globally the UI locks
// the switch, so a write here is only ever the user's own per-account preference.
export const setMockMode = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    const existing = await ctx.db
      .query("userMockMode")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (enabled && !existing) await ctx.db.insert("userMockMode", { userId });
    else if (!enabled && existing) await ctx.db.delete(existing._id);
  },
});
