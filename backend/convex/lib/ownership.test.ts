import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import schema from "../schema";
import { assertOwned, findOwned } from "./ownership";

const modules = rerootModules(
  (
    import.meta as unknown as { glob: (path: string) => Record<string, () => Promise<unknown>> }
  ).glob("../**/*.ts"),
  "lib",
);

describe("assertOwned", () => {
  it("returns the row when it belongs to the caller", async () => {
    const t = convexTest(schema, modules);
    const outcome = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const noteId = await ctx.db.insert("notes", {
        userId,
        title: "Mine",
        body: "Body",
        createdAt: 1,
        updatedAt: 1,
      });
      return await assertOwned(ctx, "notes", noteId, userId);
    });
    expect(outcome).toMatchObject({ title: "Mine", body: "Body" });
  });

  it("throws for a row owned by another account", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        const ownerId = await ctx.db.insert("users", {});
        const otherId = await ctx.db.insert("users", {});
        const noteId = await ctx.db.insert("notes", {
          userId: ownerId,
          title: "Theirs",
          body: "Body",
          createdAt: 1,
          updatedAt: 1,
        });
        return await assertOwned(ctx, "notes", noteId, otherId, "Note not found");
      }),
    ).rejects.toThrow("Note not found");
  });

  it("throws the same message for a row that no longer exists", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", {});
        const noteId = await ctx.db.insert("notes", {
          userId,
          title: "Gone",
          body: "Body",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.delete(noteId);
        return await assertOwned(ctx, "notes", noteId, userId, "Note not found");
      }),
    ).rejects.toThrow("Note not found");
  });

  it("defaults the message to Not found", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        const ownerId = await ctx.db.insert("users", {});
        const otherId = await ctx.db.insert("users", {});
        const entryId = await ctx.db.insert("snippets", {
          userId: ownerId,
          trigger: "brb",
          expansion: "be right back",
          createdAt: 1,
        });
        return await assertOwned(ctx, "snippets", entryId, otherId);
      }),
    ).rejects.toThrow("Not found");
  });
});

describe("findOwned", () => {
  it("returns null instead of throwing for a foreign or missing row", async () => {
    const t = convexTest(schema, modules);
    const [foreign, missing] = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {});
      const otherId = await ctx.db.insert("users", {});
      const kept = await ctx.db.insert("notes", {
        userId: ownerId,
        title: "Theirs",
        body: "Body",
        createdAt: 1,
        updatedAt: 1,
      });
      const dropped = await ctx.db.insert("notes", {
        userId: otherId,
        title: "Gone",
        body: "Body",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.delete(dropped);
      return [
        await findOwned(ctx, "notes", kept, otherId),
        await findOwned(ctx, "notes", dropped, otherId),
      ];
    });
    expect(foreign).toBeNull();
    expect(missing).toBeNull();
  });
});
