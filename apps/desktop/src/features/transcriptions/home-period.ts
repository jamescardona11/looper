import { useSyncExternalStore } from "react";

export type TimeOfDayPeriod = "morning" | "afternoon" | "evening";

const DAYTIME_BANDS: ReadonlyArray<{
  period: Exclude<TimeOfDayPeriod, "evening">;
  startsAt: number;
  endsAt: number;
}> = [
  { period: "morning", startsAt: 6, endsAt: 12 },
  { period: "afternoon", startsAt: 12, endsAt: 17 },
];

export function timeOfDayPeriod(now: Date = new Date()): TimeOfDayPeriod {
  const hour = now.getHours();
  return (
    DAYTIME_BANDS.find(
      ({ startsAt, endsAt }) => hour >= startsAt && hour < endsAt,
    )?.period ?? "evening"
  );
}

function atLocalHour(date: Date, hour: number) {
  const boundary = new Date(date);
  boundary.setHours(hour, 0, 0, 0);
  return boundary;
}

function startOfNextLocalDay(date: Date) {
  return atLocalHour(date, 24);
}

function endOfCurrentPeriod(now: Date) {
  const period = timeOfDayPeriod(now);
  if (period === "morning") return atLocalHour(now, 12);
  if (period === "afternoon") return atLocalHour(now, 17);
  if (now.getHours() < 6) return atLocalHour(now, 6);

  const nextMorning = startOfNextLocalDay(now);
  nextMorning.setHours(6, 0, 0, 0);
  return nextMorning;
}

function millisecondsUntilHomeClockChange(now: Date = new Date()) {
  const nextBoundary = Math.min(
    endOfCurrentPeriod(now).getTime(),
    startOfNextLocalDay(now).getTime(),
  );
  return Math.max(1_000, nextBoundary - now.getTime() + 50);
}

type ClockListener = () => void;

const clockListeners = new Set<ClockListener>();
let clockRevision = 0;
let clockTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

function stopClock() {
  if (clockTimeout === null) return;
  globalThis.clearTimeout(clockTimeout);
  clockTimeout = null;
}

function scheduleClock() {
  stopClock();
  clockTimeout = globalThis.setTimeout(() => {
    clockTimeout = null;
    clockRevision += 1;
    for (const listener of clockListeners) listener();
    if (clockListeners.size > 0) scheduleClock();
  }, millisecondsUntilHomeClockChange());
}

function subscribeToHomeClock(listener: ClockListener) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) scheduleClock();

  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) stopClock();
  };
}

function ignoreHomeClock() {
  return () => undefined;
}

function currentClockRevision() {
  return clockRevision;
}

function inactiveClockRevision() {
  return 0;
}

/** Re-renders consumers at midnight and at each local day-period boundary. */
export function useTimeOfDayPeriodTick(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeToHomeClock : ignoreHomeClock,
    enabled ? currentClockRevision : inactiveClockRevision,
    inactiveClockRevision,
  );
}
