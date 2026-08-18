import { timeOfDayPeriod, type TimeOfDayPeriod } from "./home-period";

const PERIOD_CODE: Record<TimeOfDayPeriod, number> = {
  morning: 1,
  afternoon: 2,
  evening: 3,
};

function localDateCode(date: Date) {
  return (
    date.getFullYear() * 10_000 +
    (date.getMonth() + 1) * 100 +
    date.getDate()
  );
}

function foldSeed(seed: number, value: number) {
  const multiplied = Math.imul(seed ^ value, 0x9e3779b1);
  return multiplied ^ (multiplied >>> 13);
}

function periodSeed(now: Date, extraSalt: number) {
  const folded = [
    localDateCode(now),
    PERIOD_CODE[timeOfDayPeriod(now)],
    extraSalt,
  ].reduce(foldSeed, 0);
  const mixed = Math.imul(folded ^ (folded >>> 16), 0x85ebca6b);
  return (mixed ^ (mixed >>> 13)) >>> 0;
}

export function pickStableForCurrentPeriod<T>(
  items: readonly T[],
  extraSalt: number,
  now: Date = new Date(),
): T | undefined {
  if (items.length === 0) return undefined;
  return items[periodSeed(now, extraSalt) % items.length];
}
