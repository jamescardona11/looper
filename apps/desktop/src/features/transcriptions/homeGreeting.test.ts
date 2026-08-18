import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getHomeGreetingVariant,
  getHomeOccasions,
  homeGreetingKey,
  labelForHomeGreeting,
  pickStableForCurrentPeriod,
  timeOfDayPeriod,
} from "./homeGreeting";

afterEach(() => vi.useRealTimers());

describe("home time periods", () => {
  test.each([
    ["2026-08-16T05:59:59", "evening"],
    ["2026-08-16T06:00:00", "morning"],
    ["2026-08-16T11:59:59", "morning"],
    ["2026-08-16T12:00:00", "afternoon"],
    ["2026-08-16T16:59:59", "afternoon"],
    ["2026-08-16T17:00:00", "evening"],
  ] as const)("maps %s to %s", (timestamp, expected) => {
    expect(timeOfDayPeriod(new Date(timestamp))).toBe(expected);
  });

  test("keeps a deterministic choice within each local period", () => {
    const choices = ["one", "two", "three", "four"];

    expect(
      pickStableForCurrentPeriod(
        choices,
        7,
        new Date("2024-02-29T08:00:00"),
      ),
    ).toBe("four");
    expect(
      pickStableForCurrentPeriod(
        choices,
        7,
        new Date("2024-02-29T13:00:00"),
      ),
    ).toBe("two");
    expect(
      pickStableForCurrentPeriod(
        choices,
        7,
        new Date("2024-02-29T20:00:00"),
      ),
    ).toBe("three");
  });
});

describe("home greeting policy", () => {
  test("offers the leap-day occasion only on February 29", () => {
    expect(getHomeOccasions(new Date("2024-02-29T09:00:00"))).toEqual([
      "leap_day",
    ]);
    expect(getHomeOccasions(new Date("2024-03-01T09:00:00"))).toEqual([]);
  });

  test("uses the stable occasion variant and key on leap day", () => {
    const now = new Date("2024-02-29T09:00:00");
    const variant = getHomeGreetingVariant(now);

    expect(variant).toEqual({ kind: "occasion", id: "leap_day" });
    expect(homeGreetingKey(variant, now)).toBe("occasion-leap_day");
  });

  test("keeps the visible greeting copy for every period", () => {
    const translate = ({ id, message }: { id: string; message: string }) =>
      `${id}:${message}`;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T08:00:00"));
    expect(labelForHomeGreeting({ kind: "time" }, translate)).toBe(
      "home.greeting.morning:Good morning",
    );

    vi.setSystemTime(new Date("2026-08-16T14:00:00"));
    expect(labelForHomeGreeting({ kind: "time" }, translate)).toBe(
      "home.greeting.afternoon:Good afternoon",
    );

    vi.setSystemTime(new Date("2026-08-16T20:00:00"));
    expect(labelForHomeGreeting({ kind: "time" }, translate)).toBe(
      "home.greeting.evening:Good evening",
    );
  });
});
