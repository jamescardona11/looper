import { describe, expect, test } from "vitest";

import { groupByDay } from "../groupByDay";

const LABELS = { today: "Today", yesterday: "Yesterday" };
// Mediodía, para que sumar/restar horas no cruce medianoche por accidente.
const NOW = new Date("2026-08-04T12:00:00").getTime();
const HOUR = 3_600_000;
const at = (ms: number) => ({ ms });
const stamp = (item: { ms: number }) => item.ms;

describe("groupByDay", () => {
  test("names today and yesterday, and dates everything older", () => {
    const groups = groupByDay(
      [at(NOW), at(NOW - 24 * HOUR), at(NOW - 72 * HOUR)],
      stamp,
      LABELS,
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Aug 1",
    ]);
  });

  test("keeps same-day items in one group", () => {
    const groups = groupByDay(
      [at(NOW), at(NOW - HOUR), at(NOW - 2 * HOUR)],
      stamp,
      LABELS,
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
  });

  test("cuts at midnight, not at 24-hour distance", () => {
    const justAfterMidnight = new Date("2026-08-04T00:30:00").getTime();
    const justBeforeMidnight = new Date("2026-08-03T23:30:00").getTime();

    const groups = groupByDay(
      [at(justAfterMidnight), at(justBeforeMidnight)],
      stamp,
      LABELS,
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
  });

  test("re-opens a group when the day comes back after a gap", () => {
    // Orden de relevancia (no cronológico): el corte sigue al día mostrado.
    const groups = groupByDay(
      [at(NOW), at(NOW - 24 * HOUR), at(NOW - HOUR)],
      stamp,
      LABELS,
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Today",
    ]);
  });

  test("returns nothing for an empty list", () => {
    expect(groupByDay([], stamp, LABELS, NOW)).toEqual([]);
  });
});
