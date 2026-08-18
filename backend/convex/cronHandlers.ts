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
