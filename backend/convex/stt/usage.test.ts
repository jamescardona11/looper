import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = rerootModules(
  (
    import.meta as unknown as { glob: (path: string) => Record<string, () => Promise<unknown>> }
  ).glob("../**/*.ts"),
  "stt",
);

const usageApi = (api as any).stt.usage;
const now = Date.UTC(2026, 6, 18, 15);
const todayStart = Date.UTC(2026, 6, 18);

afterEach(() => vi.useRealTimers());

describe("stt.usage.current", () => {
  it("summarizes only the signed-in user's cloud audio activity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));
    const otherUserId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    await t.run(async (ctx) => {
      await ctx.db.insert("sttTranscriptions", {
        userId,
        provider: "deepgram",
        model: "nova-3",
        status: "done",
        durationMs: 60_000,
        audioSizeBytes: 2_000,
        audioRetained: true,
        createdAt: todayStart + 1_000,
      });
      await ctx.db.insert("sttTranscriptions", {
        userId,
        provider: "openai",
        model: "gpt-4o-transcribe",
        status: "error",
        durationMs: 30_000,
        audioSizeBytes: 1_000,
        audioRetained: false,
        createdAt: todayStart + 2_000,
      });
      await ctx.db.insert("sttTranscriptions", {
        userId,
        provider: "deepgram",
        model: "streaming",
        mode: "live",
        status: "done",
        durationMs: 45_000,
        createdAt: todayStart - 1_000,
      });
      await ctx.db.insert("sttTranscriptions", {
        userId: otherUserId,
        provider: "deepgram",
        model: "nova-3",
        status: "done",
        durationMs: 999_000,
        audioSizeBytes: 999_000,
        createdAt: todayStart + 3_000,
      });
    });

    const snapshot = await t.withIdentity({ subject: userId }).query(usageApi.current, {});

    expect(snapshot.scope).toBe("cloud");
    expect(snapshot.today).toEqual({
      transcriptions: 2,
      completed: 1,
      failed: 1,
      durationMs: 90_000,
      processedBytes: 3_000,
      storedBytes: 2_000,
    });
    expect(snapshot.month).toEqual({
      transcriptions: 3,
      completed: 2,
      failed: 1,
      durationMs: 135_000,
      processedBytes: 3_000,
      storedBytes: 2_000,
    });
    expect(snapshot.daily).toHaveLength(14);
    expect(snapshot.daily.at(-1)?.transcriptions).toBe(2);
    expect(snapshot.byProvider.deepgram.transcriptions).toBe(2);
    expect(snapshot.byProvider.openai.failed).toBe(1);
  });

  it("does not expose activity without authentication", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(usageApi.current, {})).resolves.toEqual({
      today: {
        transcriptions: 0,
        completed: 0,
        failed: 0,
        durationMs: 0,
        processedBytes: 0,
        storedBytes: 0,
      },
      month: {
        transcriptions: 0,
        completed: 0,
        failed: 0,
        durationMs: 0,
        processedBytes: 0,
        storedBytes: 0,
      },
      daily: [],
      byProvider: {},
      scope: "cloud",
    });
  });
});
