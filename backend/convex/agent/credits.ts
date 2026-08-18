// Per-user rate limiting for AI chat messages using @convex-dev/rate-limiter.
// Sharded, transactional, O(1) — replaces naive row-counting approach.
//
// One token per message. Two call sites, but only the first spends:
//   1. `addUserMessage` passes a `consumeCreditKey` → spends the daily token.
//   2. `reply.ts` calls again WITHOUT a key → only resolves tier/BYOK for tool
//      gating; it does NOT touch the rate limiter, so the turn isn't charged twice.
//
// Bypassed entirely when the user has supplied their own OpenAI key (BYOK).

import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { getActiveModel, RATE_LIMITS, type RateLimitTier } from "@looper/config/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, query } from "../_generated/server";
import { deductCredits, getCreditBalance } from "../payments/credits";

const DAY_MS = 24 * 60 * 60 * 1000;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  freeMessages: {
    kind: "fixed window",
    rate: RATE_LIMITS.free.messagesPerDay,
    period: DAY_MS,
  },
  proMessages: {
    kind: "fixed window",
    rate: RATE_LIMITS.pro.messagesPerDay,
    period: DAY_MS,
  },
});

async function resolveTier(_ctx: any, _userId: string): Promise<RateLimitTier> {
  const sub = await _ctx.db
    .query("userSubscriptions")
    .withIndex("by_user", (q: any) => q.eq("userId", _userId))
    .first();
  if (sub?.tier === "pro" || sub?.tier === "ultra") return sub.tier;
  return "free";
}

// BYOK bypasses limits only when the user has a key for the *active* provider
// (the one the agent will actually route through) — not just any provider.
// getActiveModel() throws if AI_MODEL is misconfigured; that must never crash
// the balance query, so fall back to "openai" for BYOK detection.
// Does the user have their OWN key for a specific provider? Powers per-feature
// BYOK bypass — someone paying ElevenLabs/OpenAI directly shouldn't also spend
// kit credits on that feature.
async function userHasKeyForProvider(ctx: any, userId: string, provider: string): Promise<boolean> {
  const row = await ctx.db
    .query("userApiKeys")
    .withIndex("by_user_provider", (q: any) => q.eq("userId", userId).eq("provider", provider))
    .first();
  return Boolean(row);
}

async function userHasOwnKey(ctx: any, userId: string): Promise<boolean> {
  let activeProvider: string;
  try {
    activeProvider = getActiveModel().provider;
  } catch {
    activeProvider = "openai";
  }
  return userHasKeyForProvider(ctx, userId, activeProvider);
}

export const balance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const tier = await resolveTier(ctx, userId);
    const byok = await userHasOwnKey(ctx, userId);
    const creditBalance = await getCreditBalance(ctx, userId);
    const limit = RATE_LIMITS[tier].messagesPerDay;
    const unlimited = limit < 0 || byok;

    if (unlimited) {
      return {
        tier,
        byok,
        creditBalance,
        used: 0,
        limit: null,
        remaining: null,
        resetAtMs: Date.now() + DAY_MS,
      };
    }

    // Read the real remaining budget from the rate limiter (no token consumed).
    // For a fixed window, `value` is the remaining count and `ts` is the window
    // start, so `used = rate - remaining` and the window resets at ts + period.
    const limitName = tier === "pro" ? "proMessages" : "freeMessages";
    const { value, ts, config } = await rateLimiter.getValue(ctx, limitName, { key: userId });
    const remaining = Math.max(0, Math.floor(value));
    return {
      tier,
      byok,
      creditBalance,
      used: Math.max(0, limit - remaining),
      limit,
      remaining,
      resetAtMs: ts + config.period,
    };
  },
});

export const assertWithinLimit = internalMutation({
  args: {
    userId: v.id("users"),
    // Authoritative sends (addUserMessage) pass a unique key; if the daily limit
    // is hit, ONE credit is deducted under this key (idempotent). Downstream
    // defense-in-depth calls (reply.ts) omit it and are allowed through, since
    // the send was already gated here — avoids double-charging a credit.
    consumeCreditKey: v.optional(v.string()),
  },
  handler: async (ctx, { userId, consumeCreditKey }) => {
    if (await userHasOwnKey(ctx, userId)) {
      const tier = await resolveTier(ctx, userId);
      return { ok: true, byok: true as const, tier };
    }
    const tier = await resolveTier(ctx, userId);
    const limit = RATE_LIMITS[tier].messagesPerDay;
    if (limit < 0) return { ok: true, tier };

    // Only the authoritative send (addUserMessage) carries a consumeCreditKey and
    // spends a token here. Defense-in-depth callers (reply.ts) omit the key and
    // pass through WITHOUT touching the rate limiter — the send was already gated
    // when the message was created. Consuming here too would burn two tokens per
    // message (this gate runs twice per turn).
    if (!consumeCreditKey) return { ok: true, tier };

    const limitName = tier === "pro" ? "proMessages" : "freeMessages";
    const { ok } = await rateLimiter.limit(ctx, limitName, { key: userId });
    if (ok) return { ok: true, tier };

    const { ok: paid } = await deductCredits(ctx, {
      userId,
      amount: 1,
      idempotencyKey: consumeCreditKey,
      reason: "AI message (credit overflow)",
    });
    if (paid) return { ok: true, tier, viaCredit: true as const };
    throw new Error(
      `Daily limit reached (${limit} messages on the ${tier} tier). ` +
        "Add your OpenAI key in Settings → API Keys to use your provider allowance.",
    );
  },
});

// Generic weighted credit gate for optional provider-backed actions.
// A `cost` of N draws N from the daily tier
// allowance, then blocks. BYOK for the action's `provider` bypasses it; ultra is
// unlimited. Callers skip this entirely
// in mock mode so keyless testing stays free. The agent keeps assertWithinLimit
// above (its rate-limiter double-call dance is agent-specific).
export const assertCredits = internalMutation({
  args: {
    userId: v.id("users"),
    cost: v.number(),
    idempotencyKey: v.string(),
    reason: v.string(),
    // The provider this action routes through, for per-feature BYOK bypass.
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, cost, provider } = args;
    const amount = Math.max(1, Math.ceil(cost));
    if (provider && (await userHasKeyForProvider(ctx, userId, provider))) {
      return { ok: true, byok: true as const };
    }
    const tier = await resolveTier(ctx, userId);
    if (RATE_LIMITS[tier].messagesPerDay < 0) return { ok: true, tier }; // ultra: unlimited
    const limitName = tier === "pro" ? "proMessages" : "freeMessages";
    const { ok } = await rateLimiter.limit(ctx, limitName, { key: userId, count: amount });
    if (ok) return { ok: true, tier };
    const { ok: paid } = await deductCredits(ctx, {
      userId,
      amount,
      idempotencyKey: args.idempotencyKey,
      reason: args.reason,
    });
    if (paid) return { ok: true, tier, viaCredit: true as const };
    throw new Error(
      `Not enough daily allowance for this action (costs ${amount}). ` +
        "Add your own API key in Settings → API Keys to use your provider allowance.",
    );
  },
});
