import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = rerootModules(
  (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
    "../**/*.ts",
  ),
  "agent",
);

const toolsApi = (internal as any).agent.tools;
type Ctx = Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0];

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx: Ctx) => await ctx.db.insert("users", {}));
}

describe("agent tool backing queries", () => {
  it("searches notes, dictations, and meetings without crossing users", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const otherUserId = await seedUser(t);

    await t.run(async (ctx: Ctx) => {
      await ctx.db.insert("notes", {
        userId: userId as never,
        title: "Launch plan",
        body: "The cobalt launch needs a pricing review.",
        createdAt: 100,
        updatedAt: 200,
      });
      await ctx.db.insert("transcriptions", {
        userId: userId as never,
        text: "Cobalt launch dictation",
        source: "local",
        createdAt: 300,
      });
      await ctx.db.insert("meetingSessions", {
        userId: userId as never,
        meetingId: "meeting-cobalt",
        title: "Cobalt review",
        state: "ended",
        sharingEnabled: false,
        nextSequence: 1,
        startedAt: 400,
        lastActiveAt: 500,
        endedAt: 500,
      });
      await ctx.db.insert("meetingTranscriptSegments", {
        userId: userId as never,
        meetingId: "meeting-cobalt",
        sequence: 0,
        timestampMs: 0,
        text: "We approved the cobalt launch date.",
        status: "final",
        createdAt: 450,
      });
      await ctx.db.insert("notes", {
        userId: otherUserId as never,
        title: "Cobalt secret",
        body: "This must never be returned.",
        createdAt: 600,
        updatedAt: 600,
      });
    });

    const results = await t.query(toolsApi._searchLooperMemory, {
      userId,
      query: "cobalt launch",
      limit: 10,
    });

    expect(results.map((result: { kind: string }) => result.kind)).toEqual([
      "meeting",
      "dictation",
      "note",
    ]);
    expect(results.map((result: { text: string }) => result.text).join("\n")).not.toContain(
      "never be returned",
    );

    const meetingsOnly = await t.query(toolsApi._searchLooperMemory, {
      userId,
      query: "cobalt launch",
      kinds: ["meeting"],
      meetingId: "meeting-cobalt",
    });
    expect(meetingsOnly).toHaveLength(1);
    expect(meetingsOnly[0]).toMatchObject({ kind: "meeting", id: "meeting-cobalt" });
  });

  it("lists recent items inside a scope when the question has no useful search term", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await t.run(async (ctx: Ctx) => {
      await ctx.db.insert("notes", {
        userId: userId as never,
        title: "Older note",
        body: "First",
        createdAt: 100,
        updatedAt: 200,
      });
      await ctx.db.insert("notes", {
        userId: userId as never,
        title: "Latest note",
        body: "Second",
        createdAt: 300,
        updatedAt: 400,
      });
      await ctx.db.insert("transcriptions", {
        userId: userId as never,
        text: "This dictation must stay outside the notes scope.",
        source: "local",
        createdAt: 500,
      });
    });

    const results = await t.query(toolsApi._searchLooperMemory, {
      userId,
      query: "",
      kinds: ["note"],
      limit: 10,
    });

    expect(results.map((result: { title: string }) => result.title)).toEqual([
      "Latest note",
      "Older note",
    ]);
    expect(results.every((result: { kind: string }) => result.kind === "note")).toBe(true);
  });
});
