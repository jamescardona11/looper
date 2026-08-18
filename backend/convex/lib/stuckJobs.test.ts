import { describe, expect, it } from "vitest";
import { reapStuckJobs } from "./stuckJobs";

describe("reapStuckJobs", () => {
  it("finds jobs using the shared cutoff and batch, then fails each one", async () => {
    const failed: string[] = [];
    let query: { cutoff: number; limit: number } | undefined;

    const result = await reapStuckJobs({
      now: () => 10_000,
      staleAfterMs: 1_000,
      batchSize: 50,
      findStuck: async (cutoff, limit) => {
        query = { cutoff, limit };
        return ["job-1", "job-2"];
      },
      fail: async (job) => {
        failed.push(job);
      },
    });

    expect(query).toEqual({ cutoff: 9_000, limit: 50 });
    expect(failed).toEqual(["job-1", "job-2"]);
    expect(result).toEqual({ reaped: 2 });
  });

  it("returns zero when no jobs are stale", async () => {
    const result = await reapStuckJobs({
      findStuck: async () => [],
      fail: async () => undefined,
    });

    expect(result).toEqual({ reaped: 0 });
  });
});
