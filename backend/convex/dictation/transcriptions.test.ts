import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "dictation",
);

const transcriptionsApi = (api as any).dictation.transcriptions;

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

describe("dictation.transcriptions", () => {
  it("record + list, newest first, capped by limit, scoped to the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherUserId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await as.mutation(api.dictation.transcriptions.record, { text: "first", source: "local" });
    await as.mutation(api.dictation.transcriptions.record, { text: "second", source: "remote" });
    await t
      .withIdentity({ subject: otherUserId })
      .mutation(api.dictation.transcriptions.record, { text: "intruder", source: "local" });

    const all = await as.query(api.dictation.transcriptions.list, {});
    expect(all.map((e: Doc<"transcriptions">) => e.text)).toEqual(["second", "first"]);
    expect(all[0].source).toBe("remote");

    const limited = await as.query(api.dictation.transcriptions.list, { limit: 1 });
    expect(limited.map((e: Doc<"transcriptions">) => e.text)).toEqual(["second"]);
  });

  it("rejects blank text", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    await expect(
      as.mutation(api.dictation.transcriptions.record, { text: "  ", source: "local" }),
    ).rejects.toThrow("Text is required");
  });

  it("returns an empty list when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.dictation.transcriptions.list, {})).toEqual([]);
  });

  it("upserts a local dictation by source id and preserves when it occurred", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const as = t.withIdentity({ subject: userId });

    const firstId = await as.mutation(transcriptionsApi.record, {
      text: "original wording",
      source: "local",
      sourceId: "desktop-dictation-1",
      occurredAt: 1_700_000_000_000,
    });
    const secondId = await as.mutation(transcriptionsApi.record, {
      text: "edited wording",
      source: "local",
      sourceId: "desktop-dictation-1",
      occurredAt: 1_700_000_000_000,
    });

    expect(secondId).toBe(firstId);
    const all = await as.query(transcriptionsApi.list, {});
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      text: "edited wording",
      sourceId: "desktop-dictation-1",
      occurredAt: 1_700_000_000_000,
    });
  });
});
