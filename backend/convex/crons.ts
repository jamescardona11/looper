// Scheduled cron jobs using Convex native crons.
// These run at the specified interval automatically after deployment.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "archive stale threads",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cronHandlers.archiveStaleThreads,
);

crons.weekly(
  "prune payment events",
  { dayOfWeek: "sunday", hourUTC: 4, minuteUTC: 0 },
  internal.cronHandlers.prunePaymentEvents,
);

// Reap background jobs stuck in a non-terminal status (see cronHandlers).

export default crons;
