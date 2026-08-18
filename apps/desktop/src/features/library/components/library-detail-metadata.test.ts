import { describe, expect, test } from "vitest";

import {
  formatLibraryCreatedDate,
  SPEAKER_COLORS,
} from "./library-detail-metadata";

describe("library detail metadata", () => {
  test("keeps the six speaker color tokens in display order", () => {
    expect(SPEAKER_COLORS).toEqual([
      "var(--data-speaker-1)",
      "var(--data-speaker-2)",
      "var(--data-speaker-3)",
      "var(--data-speaker-4)",
      "var(--data-speaker-5)",
      "var(--data-speaker-6)",
    ]);
  });

  test("formats valid dates with the active locale", () => {
    const createdAt = "2026-08-16T12:30:00.000Z";
    const expected = new Date(createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    expect(formatLibraryCreatedDate(createdAt)).toBe(expected);
  });

  test("rejects invalid creation dates", () => {
    expect(formatLibraryCreatedDate("not-a-date")).toBeNull();
  });
});
