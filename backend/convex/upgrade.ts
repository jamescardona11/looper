// Anonymous → email account upgrade.
//
// `viewer` exposes a thin profile + isAnonymous flag for the client to
// detect whether the current user is anonymous.
//
// `claimAnonymousData` transfers all user-scoped rows from the orphaned
// anonymous user to the currently-authenticated user. Called from the UI
// AFTER the email OTP signIn flips the session onto the real account.
//
// The claim is authorized by a single-use nonce minted by
// `prepareAnonymousUpgrade` BEFORE the signIn, while the session is still the
// anonymous one. Minting therefore requires being authenticated as that
// anonymous user, which is what stops any signed-in account from absorbing —
// and deleting — a stranger's anonymous session by guessing its user id.
//
// Defensive checks:
//   - Caller must be authenticated (the new account).
//   - Caller and source must differ.
//   - The nonce must exist, belong to `anonymousUserId`, and not be expired.
//   - `anonymousUserId` must exist and have `isAnonymous: true` so we
//     don't accidentally absorb a real account's data.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ownerFieldForTable, upgradeScopedTables } from "./userScopedTables";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      userId,
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      isAnonymous: Boolean(user.isAnonymous),
    };
  },
});

// Tables that carry a userId field and transfer on anonymous→real upgrade.
// Declared once in ./userScopedTables (transferOnUpgrade flag); add new tables
// there so anonymous upgrades transfer the rows.
const USER_SCOPED_TABLES = upgradeScopedTables();

// How long a minted upgrade intent stays spendable. The client mints it and
// spends it either side of a single OTP sign-in, so minutes are plenty.
const UPGRADE_INTENT_TTL_MS = 10 * 60 * 1000;

// Mints the single-use nonce that authorizes a later `claimAnonymousData`.
// MUST be called while the session is still the anonymous one — that is the
// whole authorization: only the anonymous user can mint their own intent.
export const prepareAnonymousUpgrade = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (!user.isAnonymous) {
      throw new Error("Only an anonymous session can prepare an upgrade");
    }

    // One live intent per anonymous user: a retried upgrade invalidates the
    // previous nonce instead of leaving spendable copies behind.
    const previous = await ctx.db
      .query("anonymousUpgradeIntents")
      .withIndex("by_anonymous_user", (q) => q.eq("anonymousUserId", userId))
      .collect();
    for (const intent of previous) {
      await ctx.db.delete(intent._id);
    }

    const nonce = crypto.randomUUID();
    await ctx.db.insert("anonymousUpgradeIntents", {
      anonymousUserId: userId,
      nonce,
      expiresAt: Date.now() + UPGRADE_INTENT_TTL_MS,
    });

    return { nonce };
  },
});

export const claimAnonymousData = mutation({
  args: { anonymousUserId: v.id("users"), nonce: v.string() },
  handler: async (ctx, { anonymousUserId, nonce }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (userId === anonymousUserId) {
      // Convex Auth may have upgraded the account in place; the client treats
      // this exact message as "nothing left to transfer".
      throw new Error("Source and target users must differ");
    }

    const intent = await ctx.db
      .query("anonymousUpgradeIntents")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .unique();
    if (!intent || intent.anonymousUserId !== anonymousUserId) {
      throw new Error("Upgrade intent not found; refusing to merge");
    }
    if (intent.expiresAt <= Date.now()) {
      // No cleanup here: throwing rolls the mutation back, so the row survives
      // either way. It is unspendable from now on.
      throw new Error("Upgrade intent expired; refusing to merge");
    }
    // Single use: spend it before any row moves.
    await ctx.db.delete(intent._id);

    const source = await ctx.db.get(anonymousUserId);
    if (!source) throw new Error("Anonymous user not found");
    if (!source.isAnonymous) {
      throw new Error("Source user is not anonymous; refusing to merge");
    }

    const moved: Record<string, number> = {};
    for (const table of USER_SCOPED_TABLES) {
      let count = 0;
      // Generic scan — most tables index by userId, but a plain filter is
      // simpler and the volumes per anon user are tiny.
      const rows = await ctx.db
        .query(table as any)
        .filter((q: any) => q.eq(q.field(ownerFieldForTable(table)), anonymousUserId))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { [ownerFieldForTable(table)]: userId } as any);
        count += 1;
      }
      if (count > 0) moved[table] = count;
    }

    // Remove the now-empty anonymous user record so it doesn't linger.
    await ctx.db.delete(anonymousUserId);

    return { moved };
  },
});
