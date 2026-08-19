// biome-ignore-all assist/source/organizeImports: module markers must keep these imports removable.
import { internalMutation } from "./_generated/server";

export const archiveStaleThreads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("agentThreads")
      .filter((q) =>
        q.and(q.eq(q.field("archived"), false), q.lt(q.field("lastMessageAt"), thirtyDaysAgo)),
      )
      .take(100);

    for (const thread of stale) {
      await ctx.db.patch(thread._id, { archived: true });
    }
    return { archived: stale.length };
  },
});

// Anonymous upgrade intents are spent on a successful claim and replaced when the
// same anonymous user mints a new one, but an ABANDONED upgrade — the common case
// of requesting the OTP and never entering it — leaves its row behind forever.
// The table is excluded from the account-deletion cascade (userScopedTables.ts,
// ACCOUNT_DATA_TABLE_EXCLUSIONS) precisely because it is meant to expire by
// timestamp; this is what actually expires it.
export const pruneAnonymousUpgradeIntents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("anonymousUpgradeIntents")
      .filter((q) => q.lt(q.field("expiresAt"), Date.now()))
      .take(500);

    for (const intent of expired) {
      await ctx.db.delete(intent._id);
    }
    return { pruned: expired.length };
  },
});

export const prunePaymentEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("paymentEvents")
      .filter((q) => q.lt(q.field("processedAt"), ninetyDaysAgo))
      .take(500);

    for (const event of old) {
      await ctx.db.delete(event._id);
    }
    return { pruned: old.length };
  },
});
