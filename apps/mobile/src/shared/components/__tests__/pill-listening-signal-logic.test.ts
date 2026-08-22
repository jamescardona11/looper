import { describe, expect, test } from "vitest";
import {
  createPillDotGrid,
  formatPillDuration,
  meteringToAudioLevel,
  smoothAudioLevel,
} from "../pill-listening-signal-logic";

describe("mobile Pill listening signal", () => {
  test("converts native dB metering to a bounded audio level", () => {
    expect(meteringToAudioLevel(undefined)).toBe(0);
    expect(meteringToAudioLevel(-60)).toBeCloseTo(0.0316, 3);
    expect(meteringToAudioLevel(-20)).toBeCloseTo(0.316, 3);
    expect(meteringToAudioLevel(10)).toBe(1);
  });

  test("attacks faster than it releases", () => {
    expect(smoothAudioLevel(0, 1)).toBe(0.5);
    expect(smoothAudioLevel(1, 0)).toBe(0.9);
  });

  test("keeps the Desktop Pill 10 by 6 dot geometry symmetric", () => {
    const dots = createPillDotGrid();
    expect(dots).toHaveLength(60);
    expect(dots.filter((dot) => dot.column === 0)[2]?.intensity(0.8)).toBeCloseTo(
      dots.filter((dot) => dot.column === 9)[2]?.intensity(0.8) ?? 0,
    );
  });

  test("formats the compact elapsed time", () => {
    expect(formatPillDuration(65_900)).toBe("1:05");
  });
});
