export const STUCK_JOB_MS = 60 * 60 * 1000;
export const STUCK_JOB_BATCH = 100;

export type StuckJobPolicy<TJob> = {
  findStuck: (cutoff: number, limit: number) => Promise<readonly TJob[]>;
  fail: (job: TJob) => Promise<void>;
  now?: () => number;
  staleAfterMs?: number;
  batchSize?: number;
};

export async function reapStuckJobs<TJob>({
  findStuck,
  fail,
  now = Date.now,
  staleAfterMs = STUCK_JOB_MS,
  batchSize = STUCK_JOB_BATCH,
}: StuckJobPolicy<TJob>): Promise<{ reaped: number }> {
  const jobs = await findStuck(now() - staleAfterMs, batchSize);
  for (const job of jobs) await fail(job);
  return { reaped: jobs.length };
}
