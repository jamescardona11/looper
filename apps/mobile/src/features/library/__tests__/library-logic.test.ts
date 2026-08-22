import type { MeetingSession, Note } from "@looper/data";
import { describe, expect, it } from "vitest";
import {
  buildLibraryItems,
  groupLibraryItemsByDay,
  type LibraryItem,
  searchLibraryItems,
} from "../library-logic";

const note: Note = {
  id: "note-1",
  kind: "dictation",
  title: "Idea",
  body: "Enviar la propuesta",
  createdAt: 10,
  updatedAt: 20,
};
const meeting: MeetingSession = {
  meetingId: "meeting-1",
  title: "Product sync",
  state: "ended",
  sharingEnabled: false,
  nextSequence: 2,
  startedAt: 5,
  lastActiveAt: 30,
  endedAt: 30,
};

// Martes 12 de marzo de 2024, hora local: fija el día de la semana del rótulo.
const TUESDAY_12 = new Date(2024, 2, 12, 0, 30).getTime();

function itemAt(id: string, updatedAt: Date): LibraryItem {
  return {
    id,
    kind: "note",
    title: id,
    preview: "",
    updatedAt: updatedAt.getTime(),
  };
}

describe("Library", () => {
  it("unifies meetings and notes by recent activity without losing dictation kind", () => {
    expect(
      buildLibraryItems([note], [meeting], "all").map(({ id, kind }) => ({ id, kind })),
    ).toEqual([
      { id: "meeting-1", kind: "meeting" },
      { id: "note-1", kind: "dictation" },
    ]);
  });

  it("filters meetings separately from local notes and dictations", () => {
    expect(buildLibraryItems([note], [meeting], "meetings")).toHaveLength(1);
    expect(buildLibraryItems([note], [meeting], "notes")).toEqual([
      expect.objectContaining({ id: "note-1" }),
    ]);
  });

  it("splits today from yesterday at midnight, not at a 24 hour distance", () => {
    const justAfterMidnight = itemAt("hoy", new Date(2024, 2, 12, 0, 5));
    const justBeforeMidnight = itemAt("ayer", new Date(2024, 2, 11, 23, 55));

    expect(
      groupLibraryItemsByDay([justAfterMidnight, justBeforeMidnight], TUESDAY_12).map(
        ({ label, items }) => [label, items.map((item) => item.id)],
      ),
    ).toEqual([
      ["HOY", ["hoy"]],
      ["AYER", ["ayer"]],
    ]);
  });

  it("labels older days with the weekday and the day number in Spanish", () => {
    const eightDaysAgo = itemAt("viejo", new Date(2024, 2, 4, 9, 0));

    expect(groupLibraryItemsByDay([eightDaysAgo], TUESDAY_12)[0].label).toBe("LUNES 4");
  });

  it("orders groups and their items from newest to oldest", () => {
    const groups = groupLibraryItemsByDay(
      [
        itemAt("ayer-pronto", new Date(2024, 2, 11, 8, 0)),
        itemAt("viejo", new Date(2024, 2, 4, 9, 0)),
        itemAt("hoy", new Date(2024, 2, 12, 0, 5)),
        itemAt("ayer-tarde", new Date(2024, 2, 11, 20, 0)),
      ],
      TUESDAY_12,
    );

    expect(groups.map(({ label, items }) => [label, items.map((item) => item.id)])).toEqual([
      ["HOY", ["hoy"]],
      ["AYER", ["ayer-tarde", "ayer-pronto"]],
      ["LUNES 4", ["viejo"]],
    ]);
  });

  it("matches search ignoring case and accents in both directions", () => {
    const accented = itemAt("acentuado", new Date(2024, 2, 12, 9, 0));
    const plain = itemAt("plano", new Date(2024, 2, 12, 9, 0));
    const items: LibraryItem[] = [
      { ...accented, title: "Revisión de pricing" },
      { ...plain, title: "Revision anual", preview: "Sin acentos" },
    ];

    expect(searchLibraryItems(items, "revision").map((item) => item.id)).toEqual([
      "acentuado",
      "plano",
    ]);
    expect(searchLibraryItems(items, "REVISIÓN").map((item) => item.id)).toEqual([
      "acentuado",
      "plano",
    ]);
  });

  it("matches the preview as well and returns everything for an empty query", () => {
    const items = [
      { ...itemAt("uno", new Date(2024, 2, 12, 9, 0)), preview: "Cobrar el import por volumen" },
      itemAt("dos", new Date(2024, 2, 12, 9, 0)),
    ];

    expect(searchLibraryItems(items, "volumen").map((item) => item.id)).toEqual(["uno"]);
    expect(searchLibraryItems(items, "  ")).toHaveLength(2);
  });
});
