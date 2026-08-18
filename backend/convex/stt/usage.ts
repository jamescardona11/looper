import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";

type AudioUsageRow = {
  provider: string;
  status: "transcribing" | "done" | "error";
  durationMs?: number;
  audioSizeBytes?: number;
  audioRetained?: boolean;
  createdAt: number;
};

type AudioUsageTotals = {
  transcriptions: number;
  completed: number;
  failed: number;
  durationMs: number;
  processedBytes: number;
  storedBytes: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_WINDOW_DAYS = 14;

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return emptySnapshot();

    const now = Date.now();
    const todayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);
    const dailyStart = todayStart - (DAILY_WINDOW_DAYS - 1) * DAY_MS;
    const rows = (await ctx.db
      .query("sttTranscriptions")
      .withIndex("by_user", (q) =>
        q.eq("userId", userId).gte("createdAt", Math.min(monthStart, dailyStart)),
      )
      .collect()) as AudioUsageRow[];

    const monthRows = rows.filter((row) => row.createdAt >= monthStart);
    const providerEntries = new Map<string, AudioUsageTotals>();
    for (const row of monthRows) {
      const providerRows = providerEntries.get(row.provider) ?? emptyTotals();
      addRow(providerRows, row);
      providerEntries.set(row.provider, providerRows);
    }

    return {
      today: summarize(rows.filter((row) => row.createdAt >= todayStart)),
      month: summarize(monthRows),
      daily: Array.from({ length: DAILY_WINDOW_DAYS }, (_, index) => {
        const dateMs = dailyStart + index * DAY_MS;
        return {
          dateMs,
          ...summarize(
            rows.filter((row) => row.createdAt >= dateMs && row.createdAt < dateMs + DAY_MS),
          ),
        };
      }),
      byProvider: Object.fromEntries(
        [...providerEntries.entries()].sort(([left], [right]) => left.localeCompare(right)),
      ),
      scope: "cloud" as const,
    };
  },
});

function emptySnapshot() {
  return {
    today: emptyTotals(),
    month: emptyTotals(),
    daily: [] as Array<{ dateMs: number } & AudioUsageTotals>,
    byProvider: {} as Record<string, AudioUsageTotals>,
    scope: "cloud" as const,
  };
}

function summarize(rows: readonly AudioUsageRow[]): AudioUsageTotals {
  const totals = emptyTotals();
  for (const row of rows) addRow(totals, row);
  return totals;
}

function emptyTotals(): AudioUsageTotals {
  return {
    transcriptions: 0,
    completed: 0,
    failed: 0,
    durationMs: 0,
    processedBytes: 0,
    storedBytes: 0,
  };
}

function addRow(totals: AudioUsageTotals, row: AudioUsageRow): void {
  totals.transcriptions += 1;
  if (row.status === "done") totals.completed += 1;
  if (row.status === "error") totals.failed += 1;
  totals.durationMs += positiveNumber(row.durationMs);
  totals.processedBytes += positiveNumber(row.audioSizeBytes);
  if (row.audioRetained) {
    totals.storedBytes += positiveNumber(row.audioSizeBytes);
  }
}

function positiveNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcMonth(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}
