import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../../test-support/meteredHarness";
import { api } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
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

describe("dictation.replacements", () => {
  it("add + list round-trips, newest first, scoped to the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.replacements.add, { source: "gonna", destination: "going to" });
    await as.mutation(api.dictation.replacements.add, { source: "wanna", destination: "want to" });

    const list = await as.query(api.dictation.replacements.list, {});
    expect(list.map((e: Doc<"replacements">) => [e.source, e.destination])).toEqual([
      ["wanna", "want to"],
      ["gonna", "going to"],
    ]);
  });

  it("rejects a blank source or destination", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await expect(
      as.mutation(api.dictation.replacements.add, { source: "  ", destination: "x" }),
    ).rejects.toThrow("Source and destination are required");
    await expect(
      as.mutation(api.dictation.replacements.add, { source: "x", destination: "  " }),
    ).rejects.toThrow("Source and destination are required");
  });

  it("remove deletes only the caller's own entry", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });

    const id = await owner.mutation(api.dictation.replacements.add, {
      source: "gonna",
      destination: "going to",
    });

    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.dictation.replacements.remove, { id }),
    ).rejects.toThrow("Not found");

    await owner.mutation(api.dictation.replacements.remove, { id });
    expect(await owner.query(api.dictation.replacements.list, {})).toEqual([]);
  });
});
