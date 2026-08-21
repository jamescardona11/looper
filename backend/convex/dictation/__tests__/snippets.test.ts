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

describe("dictation.snippets", () => {
  it("add + list round-trips, newest first, scoped to the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.snippets.add, {
      trigger: "sig",
      expansion: "Best,\nJane",
    });
    await as.mutation(api.dictation.snippets.add, { trigger: "addr", expansion: "123 Main St" });

    const list = await as.query(api.dictation.snippets.list, {});
    expect(list.map((e: Doc<"snippets">) => e.trigger)).toEqual(["addr", "sig"]);
  });

  it("rejects a blank trigger or expansion", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await expect(
      as.mutation(api.dictation.snippets.add, { trigger: " ", expansion: "x" }),
    ).rejects.toThrow("Trigger and expansion are required");
  });

  it("remove deletes only the caller's own entry", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const owner = t.withIdentity({ subject: ownerId });

    const id = await owner.mutation(api.dictation.snippets.add, {
      trigger: "sig",
      expansion: "Best, Jane",
    });

    await expect(
      t.withIdentity({ subject: otherUserId }).mutation(api.dictation.snippets.remove, { id }),
    ).rejects.toThrow("Not found");

    await owner.mutation(api.dictation.snippets.remove, { id });
    expect(await owner.query(api.dictation.snippets.list, {})).toEqual([]);
  });
});
