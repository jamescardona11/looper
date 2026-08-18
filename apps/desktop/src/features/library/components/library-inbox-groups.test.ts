import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../../types";
import { groupLibraryItemsByRecency } from "./library-inbox-groups";

const item = (id: string, createdAt: string) =>
  ({ id, created_at: createdAt }) as LibraryItem;

describe("groupLibraryItemsByRecency", () => {
  it("groups items from the current Monday onward as this week", () => {
    const groups = groupLibraryItemsByRecency(
      [
        item("monday", "2026-08-10T00:00:00"),
        item("older", "2026-08-09T23:59:59"),
      ],
      new Date("2026-08-12T12:00:00"),
    );

    expect(groups.map((group) => [group.key, group.items[0]?.id])).toEqual([
      ["this-week", "monday"],
      ["earlier", "older"],
    ]);
  });

  it("omits empty groups and treats invalid dates as earlier", () => {
    const groups = groupLibraryItemsByRecency(
      [item("invalid", "not-a-date")],
      new Date("2026-08-12T12:00:00"),
    );

    expect(groups).toEqual([
      { key: "earlier", items: [expect.objectContaining({ id: "invalid" })] },
    ]);
  });
});
