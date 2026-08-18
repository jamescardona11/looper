export type TimePreset = "any" | "today" | "7d" | "custom";

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function shiftLocalDay(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateToken(date: Date) {
  const month = twoDigits(date.getMonth() + 1);
  const day = twoDigits(date.getDate());
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLocalDateToken(value: string) {
  const fields = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!fields) return null;

  const expected = {
    year: Number(fields[1]),
    month: Number(fields[2]) - 1,
    day: Number(fields[3]),
  };
  const parsed = new Date(expected.year, expected.month, expected.day);
  const isSameLocalDate =
    parsed.getFullYear() === expected.year &&
    parsed.getMonth() === expected.month &&
    parsed.getDate() === expected.day;
  return isSameLocalDate ? parsed : null;
}

export function matchesDateRange(
  timestamp: string | number | Date,
  after: Date | null,
  before: Date | null,
) {
  if (after === null && before === null) return true;

  const candidate = new Date(timestamp).getTime();
  if (Number.isNaN(candidate)) return false;
  if (after !== null && candidate < after.getTime()) return false;
  return before === null || candidate < before.getTime();
}

export function tokenForTimePreset(
  preset: TimePreset,
  now: Date = new Date(),
) {
  if (preset === "any" || preset === "custom") return null;

  const today = startOfLocalDay(now);
  const date = preset === "today" ? today : shiftLocalDay(today, -6);
  const operator = preset === "today" ? "on" : "after";
  return `${operator}:${formatDateToken(date)}`;
}

export function currentTimePreset(
  after: Date | null,
  before: Date | null,
): TimePreset {
  if (after === null && before === null) return "any";

  const today = startOfLocalDay(new Date());
  const tomorrow = shiftLocalDay(today, 1);
  if (
    after?.getTime() === today.getTime() &&
    before?.getTime() === tomorrow.getTime()
  ) {
    return "today";
  }

  const sevenDayStart = shiftLocalDay(today, -6);
  return after?.getTime() === sevenDayStart.getTime() && before === null
    ? "7d"
    : "custom";
}
