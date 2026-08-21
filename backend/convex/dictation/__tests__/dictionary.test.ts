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

describe("dictation.dictionary", () => {
  it("add + list round-trips, newest first, scoped to the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.dictionary.add, { term: "Deepgram" });
    await as.mutation(api.dictation.dictionary.add, { term: "Convex" });
    await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.dictation.dictionary.add, { term: "intruder" });

    const list = await as.query(api.dictation.dictionary.list, {});
    expect(list.map((e: Doc<"dictionaryEntries">) => e.term)).toEqual(["Convex", "Deepgram"]);
  });

  it("rejects a blank term", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await expect(as.mutation(api.dictation.dictionary.add, { term: "   " })).rejects.toThrow(
      "Term is required",
    );
  });

  it("rejects add/list when unauthenticated", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.dictation.dictionary.add, { term: "x" })).rejects.toThrow(
      "Must be signed in",
    );
    expect(await t.query(api.dictation.dictionary.list, {})).toEqual([]);
  });

  it("remove deletes only the caller's own entry", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });

    const id = await owner.mutation(api.dictation.dictionary.add, { term: "Deepgram" });

    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.dictation.dictionary.remove, { id }),
    ).rejects.toThrow("Not found");

    await owner.mutation(api.dictation.dictionary.remove, { id });
    expect(await owner.query(api.dictation.dictionary.list, {})).toEqual([]);
  });
});
