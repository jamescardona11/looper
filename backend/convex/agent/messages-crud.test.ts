import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import schema from "../schema";

// This test lives in convex/agent/, so the glob keys come out as "../foo.ts" /
// "./bar.ts" and must be re-rooted to convex/-relative paths for convex-test.
// Loading every module keeps the scheduled internal ref
// (internal.agent.reply.replyToThread) resolvable — the mutations call
// ctx.scheduler.runAfter to enqueue it, which convex-test does NOT auto-run, so
// the rateLimiter component never has to be registered here.
const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "agent",
);

type Ctx = Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0];

// Seed one user + an owned thread. Returns the ids the tests reference.
async function seedThread(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));
  const threadId = await t.run(async (ctx: Ctx) =>
    ctx.db.insert("agentThreads", {
      userId,
      componentThreadId: "c1",
      title: "t",
      archived: false,
      pinned: false,
      lastMessageAt: 0,
      messageCount: 0,
    }),
  );
  return { userId, threadId };
}

// Seed an ordered user/assistant/user/assistant transcript into a thread.
async function seedTranscript(t: ReturnType<typeof convexTest>, threadId: string, userId: string) {
  return await t.run(async (ctx: Ctx) => {
    const u1 = await ctx.db.insert("agentMessages", {
      threadId: threadId as never,
      userId: userId as never,
      role: "user",
      content: "first question",
      status: "done",
      createdAt: 0,
    });
    const a1 = await ctx.db.insert("agentMessages", {
      threadId: threadId as never,
      userId: userId as never,
      role: "assistant",
      content: "first answer",
      status: "done",
      createdAt: 1,
    });
    const u2 = await ctx.db.insert("agentMessages", {
      threadId: threadId as never,
      userId: userId as never,
      role: "user",
      content: "second question",
      status: "done",
      createdAt: 2,
    });
    const a2 = await ctx.db.insert("agentMessages", {
      threadId: threadId as never,
      userId: userId as never,
      role: "assistant",
      content: "second answer",
      status: "done",
      createdAt: 3,
    });
    return { u1, a1, u2, a2 };
  });
}

describe("agent.messages.editUserMessage", () => {
  it("patches the user turn content and drops every message after it", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { u1, a1 } = await seedTranscript(t, threadId, userId);

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.editUserMessage, { messageId: u1, content: "edited question" });

    const remaining = await t.run(async (ctx: Ctx) => {
      const messages = await ctx.db.query("agentMessages").collect();
      return messages
        .filter((message) => message.threadId === threadId)
        .sort((a, b) => a.createdAt - b.createdAt);
    });

    // Only the edited first user turn survives; a1/u2/a2 (everything after it) are gone.
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?._id).toBe(u1);
    expect(remaining[0]?.content).toBe("edited question");
    // The since-deleted assistant reply really was removed.
    expect(await t.run(async (ctx: Ctx) => ctx.db.get(a1))).toBeNull();
  });

  it("does not charge a credit (no agentUsage row written)", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { u1 } = await seedTranscript(t, threadId, userId);

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.editUserMessage, { messageId: u1, content: "edited" });

    const usage = await t.run(async (ctx: Ctx) => ctx.db.query("agentUsage").collect());
    expect(usage).toHaveLength(0);
  });

  it("refuses to edit an assistant message", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { a1 } = await seedTranscript(t, threadId, userId);

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(api.agent.messages.editUserMessage, { messageId: a1, content: "nope" }),
    ).rejects.toThrow("Can only edit your own messages");
  });

  it("refuses to edit a message in another user's thread", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { u1 } = await seedTranscript(t, threadId, userId);
    const otherUserId = await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));

    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.agent.messages.editUserMessage, { messageId: u1, content: "hijack" }),
    ).rejects.toThrow("Not allowed");

    // The owner's content is untouched after the rejected foreign edit.
    expect(await t.run(async (ctx: Ctx) => (await ctx.db.get(u1))?.content)).toBe("first question");
  });
});

describe("agent.messages.regenerateLast", () => {
  it("deletes the latest assistant message and keeps the user turns", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { u1, a1, u2, a2 } = await seedTranscript(t, threadId, userId);

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.regenerateLast, { threadId });

    const ids = await t.run(async (ctx: Ctx) => {
      const messages = await ctx.db.query("agentMessages").collect();
      return messages
        .filter((message) => message.threadId === threadId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((message) => message._id);
    });

    // Only the most-recent assistant reply (a2) is dropped; a1 and both user turns stay.
    expect(ids).toEqual([u1, a1, u2]);
    expect(await t.run(async (ctx: Ctx) => ctx.db.get(a2))).toBeNull();
  });

  it("schedules a fresh reply (a regeneration was kicked off)", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    await seedTranscript(t, threadId, userId);

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.regenerateLast, { threadId });

    const scheduled = await t.run(async (ctx: Ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it("is a no-op-safe reject on another user's thread", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    await seedTranscript(t, threadId, userId);
    const otherUserId = await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));

    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.agent.messages.regenerateLast, { threadId }),
    ).rejects.toThrow("Thread not found");
  });
});

describe("agent.messages.cancelGeneration", () => {
  it("marks a streaming assistant message canceled", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const streamingId = await t.run(async (ctx: Ctx) =>
      ctx.db.insert("agentMessages", {
        threadId: threadId as never,
        userId: userId as never,
        role: "assistant",
        content: "partial",
        status: "streaming",
        createdAt: 10,
      }),
    );

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.cancelGeneration, { threadId });

    expect(await t.run(async (ctx: Ctx) => (await ctx.db.get(streamingId))?.canceled)).toBe(true);
  });

  it("leaves an already-done message untouched (nothing streaming)", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const doneId = await t.run(async (ctx: Ctx) =>
      ctx.db.insert("agentMessages", {
        threadId: threadId as never,
        userId: userId as never,
        role: "assistant",
        content: "done answer",
        status: "done",
        createdAt: 10,
      }),
    );

    await t
      .withIdentity({ subject: userId })
      .mutation(api.agent.messages.cancelGeneration, { threadId });

    // Read the whole doc back: a value returned from t.run is serialized as a
    // Convex value, where `undefined` collapses to `null` — so an unset optional
    // field is only observable as `undefined` when accessed on the doc here.
    const done = await t.run(async (ctx: Ctx) => await ctx.db.get(doneId));
    expect(done?.canceled).toBeUndefined();
  });

  it("rejects cancelling on a thread the caller does not own", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    await t.run(async (ctx: Ctx) =>
      ctx.db.insert("agentMessages", {
        threadId: threadId as never,
        userId: userId as never,
        role: "assistant",
        content: "partial",
        status: "streaming",
        createdAt: 10,
      }),
    );
    const otherUserId = await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));

    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.agent.messages.cancelGeneration, { threadId }),
    ).rejects.toThrow("Thread not found");
  });
});

describe("agent.messages.rateMessage", () => {
  it("sets a thumbs-up rating, then clears it when the same rating is re-applied", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { a1 } = await seedTranscript(t, threadId, userId);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.agent.messages.rateMessage, { messageId: a1, rating: "up" });
    expect(await t.run(async (ctx: Ctx) => (await ctx.db.get(a1))?.feedback)).toBe("up");

    // Re-clicking the same rating toggles it back off. Read the whole doc back:
    // an `undefined` returned from t.run collapses to `null` (Convex value
    // serialization), so the cleared field is only observable on the doc here.
    await as.mutation(api.agent.messages.rateMessage, { messageId: a1, rating: "up" });
    const cleared = await t.run(async (ctx: Ctx) => await ctx.db.get(a1));
    expect(cleared?.feedback).toBeUndefined();
  });

  it("switches from up to down without clearing", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { a1 } = await seedTranscript(t, threadId, userId);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.agent.messages.rateMessage, { messageId: a1, rating: "up" });
    await as.mutation(api.agent.messages.rateMessage, { messageId: a1, rating: "down" });

    expect(await t.run(async (ctx: Ctx) => (await ctx.db.get(a1))?.feedback)).toBe("down");
  });

  it("rejects rating a message in another user's thread", async () => {
    const t = convexTest(schema, modules);
    const { userId, threadId } = await seedThread(t);
    const { a1 } = await seedTranscript(t, threadId, userId);
    const otherUserId = await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));

    await expect(
      t
        .withIdentity({ subject: otherUserId })
        .mutation(api.agent.messages.rateMessage, { messageId: a1, rating: "down" }),
    ).rejects.toThrow("Not allowed");

    // Read the whole doc back: an `undefined` returned from t.run collapses to
    // `null`, so the still-unset field is only observable on the doc here.
    const unrated = await t.run(async (ctx: Ctx) => await ctx.db.get(a1));
    expect(unrated?.feedback).toBeUndefined();
  });
});
