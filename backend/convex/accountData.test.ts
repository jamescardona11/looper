import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { meetingTables } from "./meetings/schema";
import {
  ACCOUNT_DATA_CASCADE_TABLES,
  ACCOUNT_DATA_TABLE_EXCLUSIONS,
  USER_SCOPED_TABLE_REGISTRY,
} from "./userScopedTables";

const modules = (
  import.meta as unknown as {
    glob: (p: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.ts");

const meetingTableNames = Object.keys(meetingTables) as Array<keyof typeof meetingTables>;

async function seedMeetingData(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  suffix: string,
) {
  await t.run(async (ctx) => {
    const meetingId = `meeting-${suffix}`;
    const now = Date.now();
    await ctx.db.insert("meetingSessions", {
      userId,
      meetingId,
      title: `Meeting ${suffix}`,
      sharingEnabled: true,
      state: "active",
      nextSequence: 2,
      startedAt: now,
      lastActiveAt: now,
    });
    await ctx.db.insert("meetingTranscriptSegments", {
      userId,
      meetingId,
      sequence: 1,
      timestampMs: 1200,
      text: `Transcript ${suffix}`,
      status: "final",
      createdAt: now,
    });
    await ctx.db.insert("meetingContexts", {
      userId,
      meetingId,
      kind: "note",
      title: `Context ${suffix}`,
      content: `Private context ${suffix}`,
      createdAt: now,
    });
    await ctx.db.insert("meetingCompanionDevices", {
      userId,
      meetingId,
      deviceId: `device-${suffix}`,
      name: `Device ${suffix}`,
      lastActiveAt: now,
    });
    await ctx.db.insert("meetingOutputRequests", {
      userId,
      meetingId,
      preview: `# Output ${suffix}`,
      status: "confirmed",
      deliveryStatus: "pending",
      createdAt: now,
      confirmedAt: now,
    });
  });
}

async function mintUpgradeNonce(
  t: ReturnType<typeof convexTest>,
  anonymousUserId: Id<"users">,
): Promise<string> {
  const { nonce } = await t
    .withIdentity({ subject: anonymousUserId })
    .mutation(api.upgrade.prepareAnonymousUpgrade, {});
  return nonce;
}

async function expectMeetingDataStillOwnedBy(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
): Promise<void> {
  await t.run(async (ctx) => {
    expect(await ctx.db.get(userId)).not.toBeNull();
    for (const table of meetingTableNames) {
      const rows = await ctx.db.query(table).collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(userId);
    }
  });
}

describe("account data lifecycle", () => {
  it("classifies every schema table into exactly one account-data lifecycle", () => {
    const schemaTables = Object.keys(
      (schema as unknown as { tables: Record<string, unknown> }).tables,
    ).sort();
    const lifecycleTables = [
      ...USER_SCOPED_TABLE_REGISTRY.map(({ table }) => table),
      ...ACCOUNT_DATA_CASCADE_TABLES,
      ...Object.keys(ACCOUNT_DATA_TABLE_EXCLUSIONS),
    ];

    expect(new Set(lifecycleTables).size).toBe(lifecycleTables.length);
    expect(lifecycleTables.sort()).toEqual(schemaTables);
    expect(Object.values(ACCOUNT_DATA_TABLE_EXCLUSIONS).every(Boolean)).toBe(true);
  });

  it("classifies every meeting table in the user-scoped registry", () => {
    const classifiedTables = new Set(USER_SCOPED_TABLE_REGISTRY.map(({ table }) => table));
    expect(meetingTableNames.filter((table) => !classifiedTables.has(table))).toEqual([]);
  });

  it("exports every category of meeting data owned by the authenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await seedMeetingData(t, userId, "export");

    const exported = (await t
      .withIdentity({ subject: userId })
      .query(api.accountData.exportMyData, {})) as Record<string, unknown>;

    expect(exported.meetingSessions).toHaveLength(1);
    expect(exported.meetingTranscriptSegments).toHaveLength(1);
    expect(exported.meetingContexts).toHaveLength(1);
    expect(exported.meetingCompanionDevices).toHaveLength(1);
    expect(exported.meetingOutputRequests).toHaveLength(1);
  });

  it("purges every meeting row after account deletion", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
      await seedMeetingData(t, userId, "purge");

      await t.withIdentity({ subject: userId }).mutation(api.accountData.deleteMyAccount, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        expect(await ctx.db.get(userId)).toBeNull();
        for (const table of meetingTableNames) {
          expect(await ctx.db.query(table).collect()).toEqual([]);
        }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("purges Convex Auth rows and their parent-linked children", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("users", {});
        const sessionId = await ctx.db.insert("authSessions", {
          userId: id,
          expirationTime: Date.now() + 60_000,
        });
        await ctx.db.insert("authRefreshTokens", {
          sessionId,
          expirationTime: Date.now() + 60_000,
        });
        await ctx.db.insert("authVerifiers", {
          sessionId,
          signature: "signature",
        });
        const accountId = await ctx.db.insert("authAccounts", {
          userId: id,
          provider: "test",
          providerAccountId: "account",
        });
        await ctx.db.insert("authVerificationCodes", {
          accountId,
          provider: "test",
          code: "code",
          expirationTime: Date.now() + 60_000,
        });
        return id;
      });

      await t.withIdentity({ subject: userId }).mutation(api.accountData.deleteMyAccount, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        for (const table of ACCOUNT_DATA_CASCADE_TABLES) {
          expect(await ctx.db.query(table).collect()).toEqual([]);
        }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("transfers every meeting row during anonymous account upgrade", async () => {
    const t = convexTest(schema, modules);
    const anonymousUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    const targetUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await seedMeetingData(t, anonymousUserId, "upgrade");

    // Minted while the session IS the anonymous user — the only way to get a
    // spendable nonce.
    const nonce = await mintUpgradeNonce(t, anonymousUserId);

    await t
      .withIdentity({ subject: targetUserId })
      .mutation(api.upgrade.claimAnonymousData, { anonymousUserId, nonce });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(anonymousUserId)).toBeNull();
      expect(await ctx.db.query("anonymousUpgradeIntents").collect()).toEqual([]);
      for (const table of meetingTableNames) {
        const rows = await ctx.db.query(table).collect();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.userId).toBe(targetUserId);
      }
    });
  });

  it("refuses to absorb an unrelated anonymous account with no minted intent", async () => {
    const t = convexTest(schema, modules);
    const anonymousUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    const attackerUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await seedMeetingData(t, anonymousUserId, "attack");

    await expect(
      t.withIdentity({ subject: attackerUserId }).mutation(api.upgrade.claimAnonymousData, {
        anonymousUserId,
        nonce: "guessed-nonce",
      }),
    ).rejects.toThrow("Upgrade intent not found");

    await expectMeetingDataStillOwnedBy(t, anonymousUserId);
  });

  it("refuses a nonce minted for a different anonymous account", async () => {
    const t = convexTest(schema, modules);
    const victimUserId = await t.run(async (ctx) => ctx.db.insert("users", { isAnonymous: true }));
    const ownAnonymousUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    const attackerUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await seedMeetingData(t, victimUserId, "mismatch");

    const nonce = await mintUpgradeNonce(t, ownAnonymousUserId);

    await expect(
      t.withIdentity({ subject: attackerUserId }).mutation(api.upgrade.claimAnonymousData, {
        anonymousUserId: victimUserId,
        nonce,
      }),
    ).rejects.toThrow("Upgrade intent not found");

    await expectMeetingDataStillOwnedBy(t, victimUserId);
  });

  it("refuses an expired upgrade intent", async () => {
    const t = convexTest(schema, modules);
    const anonymousUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { isAnonymous: true }),
    );
    const targetUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    await seedMeetingData(t, anonymousUserId, "expired");

    const nonce = await mintUpgradeNonce(t, anonymousUserId);
    await t.run(async (ctx) => {
      const intent = await ctx.db.query("anonymousUpgradeIntents").unique();
      if (!intent) throw new Error("expected a minted intent");
      await ctx.db.patch(intent._id, { expiresAt: Date.now() - 1 });
    });

    await expect(
      t.withIdentity({ subject: targetUserId }).mutation(api.upgrade.claimAnonymousData, {
        anonymousUserId,
        nonce,
      }),
    ).rejects.toThrow("Upgrade intent expired");

    await expectMeetingDataStillOwnedBy(t, anonymousUserId);
  });

  it("refuses to mint an upgrade intent from a non-anonymous session", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.upgrade.prepareAnonymousUpgrade, {}),
    ).rejects.toThrow("Only an anonymous session can prepare an upgrade");
  });
});
