import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../../**/*.ts",
  ),
  "dictation",
);

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

describe("dictation.remote — pairing", () => {
  it("registerSession creates on first call and only touches name/lastActiveAt on the next", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.remote.registerSession, {
      sessionId: "desktop-1",
      name: "Jane's MacBook",
    });
    await as.mutation(api.dictation.remote.sendDictation, {
      sessionId: "desktop-1",
      text: "hello world",
    });

    // Heartbeat must not clobber the in-flight pendingText/status.
    await as.mutation(api.dictation.remote.registerSession, {
      sessionId: "desktop-1",
      name: "Jane's MacBook (renamed)",
    });

    const sessions = await as.query(api.dictation.remote.listActiveSessions, {});
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("Jane's MacBook (renamed)");
    expect(sessions[0].status).toBe("pending");
    expect(sessions[0].pendingText).toBe("hello world");
  });

  it("listActiveSessions excludes sessions stale beyond the active window", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.remote.registerSession, {
      sessionId: "fresh",
      name: "Fresh",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("remoteDictationSessions", {
        userId,
        sessionId: "stale",
        name: "Stale",
        lastActiveAt: Date.now() - 25 * 60 * 1000, // 25 min ago, beyond the 20-min window
        status: "idle",
        seq: 0,
        createdAt: Date.now() - 25 * 60 * 1000,
      });
    });

    const sessions = await as.query(api.dictation.remote.listActiveSessions, {});
    expect(sessions.map((s: { sessionId: string }) => s.sessionId)).toEqual(["fresh"]);
  });

  it("listActiveSessions never returns another user's sessions", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherUserId = await seedUser(t);

    await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "Other's" });

    expect(
      await t.withIdentity({ subject: userId }).query(api.dictation.remote.listActiveSessions, {}),
    ).toEqual([]);
  });

  it("endSession removes only the caller's own session", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });

    await owner.mutation(api.dictation.remote.registerSession, {
      sessionId: "d1",
      name: "Owner's",
    });

    // Foreign caller's endSession is a silent no-op, not an error — mirrors the
    // "not found" ownership check elsewhere but this ends a device the caller
    // never registered, so nothing to report.
    await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.dictation.remote.endSession, { sessionId: "d1" });
    expect(await owner.query(api.dictation.remote.listActiveSessions, {})).toHaveLength(1);

    await owner.mutation(api.dictation.remote.endSession, { sessionId: "d1" });
    expect(await owner.query(api.dictation.remote.listActiveSessions, {})).toEqual([]);
  });
});

describe("dictation.remote — dictation hand-off (sub-protocol A)", () => {
  it("sendDictation requires an existing session", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await expect(
      as.mutation(api.dictation.remote.sendDictation, { sessionId: "nope", text: "hi" }),
    ).rejects.toThrow("Session not found");
  });

  it("rejects blank dictation text", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });
    await as.mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "D" });

    await expect(
      as.mutation(api.dictation.remote.sendDictation, { sessionId: "d1", text: "   " }),
    ).rejects.toThrow("Text is required");
  });

  it("getPendingDictation is null until a dictation lands, then returns it", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });
    await as.mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "D" });

    expect(
      await as.query(api.dictation.remote.getPendingDictation, { sessionId: "d1" }),
    ).toBeNull();

    await as.mutation(api.dictation.remote.sendDictation, { sessionId: "d1", text: "hello" });
    const pending = await as.query(api.dictation.remote.getPendingDictation, { sessionId: "d1" });
    expect(pending?.text).toBe("hello");
    expect(pending?.seq).toBe(1);
  });

  it("consumeDictation clears the pending text and flips status back to idle", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });
    await as.mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "D" });
    await as.mutation(api.dictation.remote.sendDictation, { sessionId: "d1", text: "hello" });

    const pending = await as.query(api.dictation.remote.getPendingDictation, { sessionId: "d1" });
    const result = await as.mutation(api.dictation.remote.consumeDictation, {
      sessionId: "d1",
      seq: pending!.seq,
    });

    expect(result).toEqual({ consumed: true });
    expect(
      await as.query(api.dictation.remote.getPendingDictation, { sessionId: "d1" }),
    ).toBeNull();
  });

  it("consumeDictation is a no-op (idempotency guard) against a stale timestamp", async () => {
    // Reproduces the exact race the audit flagged: mobile sends a SECOND
    // dictation before the receiver acks the first read. The receiver's ack
    // must not clobber the newer pending text nor report it consumed.
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });
    await as.mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "D" });

    const first = await as.mutation(api.dictation.remote.sendDictation, {
      sessionId: "d1",
      text: "first",
    });
    // A newer dictation arrives before the receiver acks the first one.
    await as.mutation(api.dictation.remote.sendDictation, { sessionId: "d1", text: "second" });

    const result = await as.mutation(api.dictation.remote.consumeDictation, {
      sessionId: "d1",
      seq: first.seq,
    });
    expect(result).toEqual({ consumed: false });

    const stillPending = await as.query(api.dictation.remote.getPendingDictation, {
      sessionId: "d1",
    });
    expect(stillPending?.text).toBe("second");
  });

  it("scopes send/get/consume to the caller's own session", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });
    const other = t.withIdentity({ subject: otherUserId });
    await owner.mutation(api.dictation.remote.registerSession, { sessionId: "d1", name: "D" });

    await expect(
      other.mutation(api.dictation.remote.sendDictation, { sessionId: "d1", text: "hi" }),
    ).rejects.toThrow("Session not found");
    expect(
      await other.query(api.dictation.remote.getPendingDictation, { sessionId: "d1" }),
    ).toBeNull();
  });
});
