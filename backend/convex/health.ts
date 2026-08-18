// Health check and status endpoint.
// Provides uptime, version, and basic stats for monitoring.

import { query } from "./_generated/server";

const START_TIME = Date.now();

export const status = query({
  args: {},
  handler: async (ctx) => {
    const uptimeMs = Date.now() - START_TIME;

    const userCount = await ctx.db.query("users").collect();
    const threadCount = await ctx.db.query("agentThreads").collect();

    return {
      status: "ok",
      version: "0.1.0",
      uptimeMs,
      uptimeFormatted: formatUptime(uptimeMs),
      stats: {
        users: userCount.length,
        threads: threadCount.length,
      },
      timestamp: Date.now(),
    };
  },
});

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}
