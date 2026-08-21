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

describe("dictation.settings", () => {
  it("get returns null before the first update", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    expect(await as.query(api.dictation.settings.get, {})).toBeNull();
  });

  it("update creates the doc at version 1, then bumps version on every write", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.settings.update, { data: { theme: "dark" } });
    const first = await as.query(api.dictation.settings.get, {});
    expect(first?.data).toEqual({ theme: "dark" });
    expect(first?.version).toBe(1);

    await as.mutation(api.dictation.settings.update, { data: { theme: "light" } });
    const second = await as.query(api.dictation.settings.get, {});
    expect(second?.data).toEqual({ theme: "light" });
    expect(second?.version).toBe(2);
    // Same document, not a new row.
    expect(second?._id).toBe(first?._id);
  });

  it("scopes get/update to the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherUserId = await seedUser(t);

    await t
      .withIdentity({ subject: userId })
      .mutation(api.dictation.settings.update, { data: { theme: "dark" } });

    expect(
      await t.withIdentity({ subject: otherUserId }).query(api.dictation.settings.get, {}),
    ).toBeNull();
  });

  it("rejects update when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.dictation.settings.update, { data: {} })).rejects.toThrow(
      "Must be signed in",
    );
  });
});
