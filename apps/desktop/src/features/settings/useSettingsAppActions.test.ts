import { describe, expect, test } from "vitest";

import { formatByteCount } from "./useSettingsAppActions";

describe("formatByteCount", () => {
  test.each([
    [0, "0 B"],
    [1024, "1 KB"],
    [5 * 1024 ** 2, "5 MB"],
    [1.25 * 1024 ** 3, "1.3 GB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatByteCount(bytes)).toBe(expected);
  });
});
