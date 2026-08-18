import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

// This test lives under convex/agent/, so its glob keys come out as "../foo.ts"
// (siblings of agent/) and "./bar.ts" (inside agent/). convex-test wants keys
// rooted at convex/, so re-root with the subdir name "agent".
const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "agent",
);

async function newUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

// db.get returns a union over all tables; narrow to the agentThreads doc.
async function getThread(t: ReturnType<typeof convexTest>, threadId: Id<"agentThreads">) {
  return (await t.run(async (ctx) => await ctx.db.get(threadId))) as Doc<"agentThreads"> | null;
}

describe("agent.threads — private recording-assistant CRUD", () => {
  describe("createThread", () => {
    it("creates a thread owned by the caller with sane defaults", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);

      const threadId = await t
        .withIdentity({ subject: userId })
        .mutation(api.agent.threads.createThread, { title: "Hello" });

      const row = await getThread(t, threadId);
      expect(row?.userId).toBe(userId);
      expect(row?.title).toBe("Hello");
      expect(row?.archived).toBe(false);
      expect(row?.pinned).toBe(false);
      expect(row?.messageCount).toBe(0);
    });

    it("uses a recording-specific default title", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);

      const threadId = await t
        .withIdentity({ subject: userId })
        .mutation(api.agent.threads.createThread, {});

      const row = await getThread(t, threadId);
      expect(row?.title).toBe("New recording question");
    });

    it("rejects an unauthenticated caller", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.agent.threads.createThread, {})).rejects.toThrow(
        "Must be signed in",
      );
    });
  });

  describe("renameThread", () => {
    it("renames the caller's own thread", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const as = t.withIdentity({ subject: userId });
      const threadId = await as.mutation(api.agent.threads.createThread, { title: "old" });

      await as.mutation(api.agent.threads.renameThread, { threadId, title: "renamed" });

      const row = await getThread(t, threadId);
      expect(row?.title).toBe("renamed");
    });

    it("rejects renaming another user's thread", async () => {
      const t = convexTest(schema, modules);
      const ownerId = await newUser(t);
      const otherId = await newUser(t);
      const threadId = await t
        .withIdentity({ subject: ownerId })
        .mutation(api.agent.threads.createThread, { title: "owned" });

      await expect(
        t
          .withIdentity({ subject: otherId })
          .mutation(api.agent.threads.renameThread, { threadId, title: "hijack" }),
      ).rejects.toThrow("Not found");

      const row = await getThread(t, threadId);
      expect(row?.title).toBe("owned");
    });
  });

  describe("archiveThread", () => {
    it("flips archived to true and removes the thread from the active list", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const as = t.withIdentity({ subject: userId });
      const threadId = await as.mutation(api.agent.threads.createThread, {});

      await as.mutation(api.agent.threads.archiveThread, { threadId });

      const row = await getThread(t, threadId);
      expect(row?.archived).toBe(true);

      const active = await as.query(api.agent.threads.listThreads, {});
      expect(active.find((th: Doc<"agentThreads">) => th._id === threadId)).toBeUndefined();
      const archived = await as.query(api.agent.threads.listThreads, { archived: true });
      expect(archived.find((th: Doc<"agentThreads">) => th._id === threadId)?._id).toBe(threadId);
    });

    it("rejects archiving another user's thread", async () => {
      const t = convexTest(schema, modules);
      const ownerId = await newUser(t);
      const otherId = await newUser(t);
      const threadId = await t
        .withIdentity({ subject: ownerId })
        .mutation(api.agent.threads.createThread, {});

      await expect(
        t
          .withIdentity({ subject: otherId })
          .mutation(api.agent.threads.archiveThread, { threadId }),
      ).rejects.toThrow("Not found");
    });
  });

  describe("deleteThread", () => {
    it("deletes the caller's own thread", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const as = t.withIdentity({ subject: userId });
      const threadId = await as.mutation(api.agent.threads.createThread, {});

      await as.mutation(api.agent.threads.deleteThread, { threadId });

      expect(await t.run(async (ctx) => await ctx.db.get(threadId))).toBeNull();
    });

    it("deletes the thread's private messages", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const as = t.withIdentity({ subject: userId });
      const threadId = await as.mutation(api.agent.threads.createThread, {});

      await t.run(async (ctx) => {
        for (let i = 0; i < 3; i++) {
          await ctx.db.insert("agentMessages", {
            threadId,
            userId,
            role: "user",
            content: `m${i}`,
            createdAt: i,
          });
        }
      });

      await as.mutation(api.agent.threads.deleteThread, { threadId });

      expect(await t.run(async (ctx) => await ctx.db.get(threadId))).toBeNull();
      const leftover = await t.run(async (ctx) =>
        ctx.db
          .query("agentMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", threadId))
          .collect(),
      );
      expect(leftover).toEqual([]);
    });

    it("rejects deleting another user's thread", async () => {
      const t = convexTest(schema, modules);
      const ownerId = await newUser(t);
      const otherId = await newUser(t);
      const threadId = await t
        .withIdentity({ subject: ownerId })
        .mutation(api.agent.threads.createThread, {});

      await expect(
        t.withIdentity({ subject: otherId }).mutation(api.agent.threads.deleteThread, { threadId }),
      ).rejects.toThrow("Not found");

      expect(await t.run(async (ctx) => await ctx.db.get(threadId))).not.toBeNull();
    });
  });

  describe("listThreads", () => {
    it("returns only the caller's active threads, newest first", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const otherId = await newUser(t);
      const as = t.withIdentity({ subject: userId });

      const a = await as.mutation(api.agent.threads.createThread, { title: "A" });
      const b = await as.mutation(api.agent.threads.createThread, { title: "B" });
      await as.mutation(api.agent.threads.archiveThread, { threadId: a });
      // Another user's thread must never appear.
      await t.withIdentity({ subject: otherId }).mutation(api.agent.threads.createThread, {
        title: "stranger",
      });

      const active = await as.query(api.agent.threads.listThreads, {});
      expect(active.map((th: Doc<"agentThreads">) => th._id)).toEqual([b]);
      expect(active.every((th: Doc<"agentThreads">) => th.userId === userId)).toBe(true);
    });

    it("returns an empty array when unauthenticated", async () => {
      const t = convexTest(schema, modules);
      expect(await t.query(api.agent.threads.listThreads, {})).toEqual([]);
    });
  });

  describe("latestThreadPreview", () => {
    it("previews the newest settled (non-streaming) message of the most recent thread", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      const as = t.withIdentity({ subject: userId });
      const threadId = await as.mutation(api.agent.threads.createThread, { title: "Chat" });

      await t.run(async (ctx) => {
        await ctx.db.insert("agentMessages", {
          threadId,
          userId,
          role: "user",
          content: "a settled answer",
          status: "done",
          createdAt: 1,
        });
        // A later streaming placeholder must be skipped so the preview stays stable.
        await ctx.db.insert("agentMessages", {
          threadId,
          userId,
          role: "assistant",
          content: "",
          status: "streaming",
          createdAt: 2,
        });
      });

      const preview = await as.query(api.agent.threads.latestThreadPreview, {});
      expect(preview?.threadId).toBe(threadId);
      expect(preview?.title).toBe("Chat");
      expect(preview?.text).toBe("a settled answer");
      expect(preview?.role).toBe("user");
    });

    it("returns null when the user has no threads", async () => {
      const t = convexTest(schema, modules);
      const userId = await newUser(t);
      expect(
        await t.withIdentity({ subject: userId }).query(api.agent.threads.latestThreadPreview, {}),
      ).toBeNull();
    });
  });
});
