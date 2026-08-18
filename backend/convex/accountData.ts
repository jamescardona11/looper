// Account data rights: export-my-data and delete-my-account.
//
// Both operate strictly on the authenticated user's own rows. `deleteMyAccount`
// removes the identity row synchronously (locking out the identity) and hands
// the bulk cascade to `_purgeUserData`, which deletes every user-owned row and
// associated storage blob in bounded, self-rescheduling batches.
//
// The set of user-owned tables is composed in ./userScopedTables; purge derives
// its lists from per-policy flags. Modules contribute their own owned tables so
// data rights stay complete without rebuilding parallel lists.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server";
import {
  exportPersonalDataTableDescriptors,
  ownerFieldForTable,
  purgePlainTables,
  purgeStorageTables,
} from "./userScopedTables";

async function rowsForUserLimited(
  ctx: MutationCtx,
  table: string,
  index: string,
  userId: Id<"users">,
  limit: number,
) {
  return await (ctx.db as any)
    .query(table)
    .withIndex(index, (q: any) => q.eq(ownerFieldForTable(table), userId))
    .take(limit);
}

// Best-effort blob deletion. Storage ids are user-controlled content; failing to
// delete one must not abort the account deletion.
async function safeDeleteStorage(ctx: MutationCtx, id: unknown): Promise<void> {
  if (!id) return;
  try {
    await ctx.storage.delete(id as Id<"_storage">);
  } catch {
    // already gone or invalid — ignore
  }
}

// Export the authenticated user's personal data as a plain object (the client
// serializes it to a downloadable JSON file). Secrets (encrypted API keys) are
// reported as metadata only — never the plaintext key.
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    const user = await ctx.db.get(userId);
    const byUser = async (table: string, index: string) =>
      await (ctx.db as any)
        .query(table)
        .withIndex(index, (q: any) => q.eq(ownerFieldForTable(table), userId))
        .collect();

    const exportedRows = Object.fromEntries(
      await Promise.all(
        exportPersonalDataTableDescriptors().map(async ({ table, index, exportKey }) => [
          exportKey,
          await byUser(table, index),
        ]),
      ),
    ) as Record<string, any[]>;

    const threads = exportedRows.threads ?? [];
    const messages: any[] = [];
    for (const t of threads) {
      const m = await (ctx.db as any)
        .query("agentMessages")
        .withIndex("by_thread", (q: any) => q.eq("threadId", t._id))
        .collect();
      messages.push(...m);
    }

    const apiKeys = exportedRows.apiKeys ?? [];

    return {
      exportedAt: Date.now(),
      profile: user ? { id: user._id, name: user.name ?? null, email: user.email ?? null } : null,
      ...exportedRows,
      messages,
      // Metadata only — the encrypted key material is never exported.
      apiKeys: apiKeys.map((k: any) => ({
        provider: k.provider,
        createdAt: k.createdAt ?? null,
        lastTestedAt: k.lastTestedAt ?? null,
      })),
    };
  },
});

// How many documents/blobs to delete per batch. Comfortably under Convex's
// per-mutation limits, while still draining a large account in a few passes.
const PURGE_BATCH = 200;

// Storage-bearing user tables and the field(s) holding their blob ids.
const STORAGE_TABLES = purgeStorageTables();

// Plain user-owned tables that can be deleted directly by user id.
const PLAIN_TABLES = purgePlainTables();

async function purgeOneAuthParent(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const session = await (ctx.db as any)
    .query("authSessions")
    .withIndex("userId", (q: any) => q.eq("userId", userId))
    .first();
  if (session) {
    const refreshTokens = await (ctx.db as any)
      .query("authRefreshTokens")
      .withIndex("sessionId", (q: any) => q.eq("sessionId", session._id))
      .take(PURGE_BATCH);
    if (refreshTokens.length > 0) {
      for (const token of refreshTokens) await ctx.db.delete(token._id);
      return true;
    }

    const verifiers = await (ctx.db as any)
      .query("authVerifiers")
      .filter((q: any) => q.eq(q.field("sessionId"), session._id))
      .take(PURGE_BATCH);
    if (verifiers.length > 0) {
      for (const verifier of verifiers) await ctx.db.delete(verifier._id);
      return true;
    }

    await ctx.db.delete(session._id);
    return true;
  }

  const account = await (ctx.db as any)
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q: any) => q.eq("userId", userId))
    .first();
  if (!account) return false;

  const verificationCodes = await (ctx.db as any)
    .query("authVerificationCodes")
    .withIndex("accountId", (q: any) => q.eq("accountId", account._id))
    .take(PURGE_BATCH);
  if (verificationCodes.length > 0) {
    for (const code of verificationCodes) await ctx.db.delete(code._id);
    return true;
  }

  await ctx.db.delete(account._id);
  return true;
}

// Permanently delete the authenticated user's account and all associated data.
//
// The identity row is removed synchronously, so the caller is locked out the
// moment this returns. Auth sessions, accounts and their children are physically
// removed by the same bounded background cascade as product data. The bulk
// cascade is handed to `_purgeUserData`, which deletes in bounded batches and
// reschedules itself until done. This keeps a heavy account (thousands of
// related rows from blowing past Convex's per-mutation document limits and
// failing partway, which would leave orphaned rows and storage blobs.
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");

    await ctx.db.delete(userId); // lock the account out now
    await ctx.scheduler.runAfter(0, internal.accountData._purgeUserData, {
      userId,
    }); // purge in background

    return { deleted: true };
  },
});

// Batched, self-rescheduling cascade delete. Each run deletes up to PURGE_BATCH
// documents (plus their blobs) and reschedules itself while there is more to do.
// Re-running is safe: every query is keyed by userId, so an interrupted run just
// reprocesses whatever remains. Terminates on the first pass that deletes nothing.
export const _purgeUserData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    let budget = PURGE_BATCH;
    let didWork = false;

    // Convex Auth owns parent-linked tables that cannot use the product registry's
    // direct userId scan. Drain one parent per pass to keep the cascade bounded.
    if (await purgeOneAuthParent(ctx, userId)) {
      await ctx.scheduler.runAfter(0, internal.accountData._purgeUserData, {
        userId,
      });
      return { done: false };
    }

    // 1. Messages (indexed only by thread), thread by thread.
    //    A thread is deleted once it has no messages left.
    const threads = await (ctx.db as any)
      .query("agentThreads")
      .withIndex("by_user_recent", (q: any) => q.eq("userId", userId))
      .take(budget);
    for (const t of threads) {
      if (budget <= 0) break;
      const messages = await (ctx.db as any)
        .query("agentMessages")
        .withIndex("by_thread", (q: any) => q.eq("threadId", t._id))
        .take(budget);
      for (const m of messages) {
        await ctx.db.delete(m._id);
        budget -= 1;
        didWork = true;
        if (budget <= 0) break;
      }
      if (messages.length === 0) {
        await ctx.db.delete(t._id);
        budget -= 1;
        didWork = true;
      }
    }

    // 2. Storage-bearing tables: delete blob(s) then the row.
    for (const { table, index, blobs } of STORAGE_TABLES) {
      if (budget <= 0) break;
      for (const row of await rowsForUserLimited(ctx, table, index, userId, budget)) {
        for (const blob of blobs(row)) await safeDeleteStorage(ctx, blob);
        await ctx.db.delete(row._id);
        budget -= 1;
        didWork = true;
        if (budget <= 0) break;
      }
    }

    // 3. Plain user-owned tables.
    for (const { table, index } of PLAIN_TABLES) {
      if (budget <= 0) break;
      for (const row of await rowsForUserLimited(ctx, table, index, userId, budget)) {
        await ctx.db.delete(row._id);
        budget -= 1;
        didWork = true;
        if (budget <= 0) break;
      }
    }

    if (didWork) {
      await ctx.scheduler.runAfter(0, internal.accountData._purgeUserData, {
        userId,
      });
      return { done: false };
    }
    return { done: true };
  },
});
