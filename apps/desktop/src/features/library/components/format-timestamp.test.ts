import { describe, expect, test } from "vitest";
import { formatTimestamp } from "./format-timestamp";

describe("library timestamps", () => {
  test("shows minute and second fields for short recordings", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65_999)).toBe("1:05");
  });

  test("adds the hour field for long recordings", () => {
    expect(formatTimestamp(3_661_000)).toBe("1:01:01");
  });
});
