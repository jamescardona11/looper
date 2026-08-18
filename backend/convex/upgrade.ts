// Anonymous → email account upgrade.
//
// `viewer` exposes a thin profile + isAnonymous flag for the client to
// detect whether the current user is anonymous.
//
// `claimAnonymousData` transfers all user-scoped rows from the orphaned
// anonymous user to the currently-authenticated user. Called from the UI
// AFTER the email OTP signIn flips the session onto the real account.
//
// Defensive checks:
//   - Caller must be authenticated (the new account).
//   - `anonymousUserId` must exist and have `isAnonymous: true` so we
//     don't accidentally absorb a real account's data.
//   - Caller and source must differ.

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

export const claimAnonymousData = mutation({
  args: { anonymousUserId: v.id("users") },
  handler: async (ctx, { anonymousUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (userId === anonymousUserId) {
      throw new Error("Source and target users must differ");
    }
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
