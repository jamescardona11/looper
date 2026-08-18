import { describe, expect, it } from "vitest";
import { formatChangelogDate } from "./entries";

describe("formatChangelogDate", () => {
  it("keeps date-only releases on their declared calendar day", () => {
    expect(formatChangelogDate("2026-06-07")).toBe("June 7, 2026");
  });

  it("returns invalid values unchanged", () => {
    expect(formatChangelogDate("not-a-date")).toBe("not-a-date");
  });
});
