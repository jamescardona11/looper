import type { LibraryItem } from "../../../contracts";

export type LibraryInboxGroup = {
  key: "this-week" | "earlier";
  items: LibraryItem[];
};

export const groupLibraryItemsByRecency = (
  items: LibraryItem[],
  now = new Date(),
): LibraryInboxGroup[] => {
  const startOfThisWeek = new Date(now);
  const dayFromMonday = (startOfThisWeek.getDay() + 6) % 7;
  startOfThisWeek.setDate(startOfThisWeek.getDate() - dayFromMonday);
  startOfThisWeek.setHours(0, 0, 0, 0);

  const thisWeek: LibraryItem[] = [];
  const earlier: LibraryItem[] = [];

  items.forEach((item) => {
    const createdAt = new Date(item.created_at).getTime();
    if (Number.isFinite(createdAt) && createdAt >= startOfThisWeek.getTime()) {
      thisWeek.push(item);
    } else {
      earlier.push(item);
    }
  });

  return [
    { key: "this-week" as const, items: thisWeek },
    { key: "earlier" as const, items: earlier },
  ].filter((group) => group.items.length > 0);
};
