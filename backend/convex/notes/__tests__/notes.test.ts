import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = rerootModules(
  (
    import.meta as unknown as { glob: (path: string) => Record<string, () => Promise<unknown>> }
  ).glob("../../**/*.ts"),
  "notes",
);

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

describe("notes", () => {
  it("creates, updates, and lists only the caller's notes", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });

    const id = await owner.mutation(api.notes.notes.create, {
      title: " Launch plan ",
      body: "First draft",
    });
    await owner.mutation(api.notes.notes.update, {
      id,
      title: "Launch plan",
      body: "Second draft",
    });
    await t.withIdentity({ subject: otherUserId }).mutation(api.notes.notes.create, {
      title: "Private",
      body: "Not visible to the owner",
    });

    const notes = await owner.query(api.notes.notes.list, {});
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject<Partial<Doc<"notes">>>({
      _id: id,
      title: "Launch plan",
      body: "Second draft",
    });
  });

  it("keeps blank notes editable and rejects writes by another user", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });
    const id = await owner.mutation(api.notes.notes.create, { title: "", body: "" });

    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.notes.notes.remove, { id }),
    ).rejects.toThrow("Note not found");
    expect((await owner.query(api.notes.notes.list, {}))[0]?.title).toBe("Untitled note");
  });

  it("migrates the same device note idempotently and keeps its kind", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });
    const input = {
      sourceId: "device-note-1",
      kind: "dictation" as const,
      title: "Imported dictation",
      body: "First version",
      createdAt: 100,
      updatedAt: 200,
    };
    const firstId = await owner.mutation(api.notes.notes.upsertFromDevice, input);
    const secondId = await owner.mutation(api.notes.notes.upsertFromDevice, {
      ...input,
      body: "Second version",
      updatedAt: 300,
    });

    expect(secondId).toBe(firstId);
    expect(await owner.query(api.notes.notes.list, {})).toMatchObject([
      { _id: firstId, kind: "dictation", body: "Second version" },
    ]);
  });
});
