import { describe, expect, it } from "vitest";
import { createLocalNote, normalizeStoredNotes, sortNotesByUpdatedAt, updateLocalNote } from "./local-notes-logic";

describe("local notes", () => {
  it("creates an untitled note and keeps the newest note first", () => {
    const older = createLocalNote({ id: "older", title: "  ", body: "First", now: 1 });
    const newer = createLocalNote({ id: "newer", title: "Plan", body: "Second", now: 2 });

    expect(older.title).toBe("Untitled note");
    expect(sortNotesByUpdatedAt([older, newer]).map((note) => note.id)).toEqual(["newer", "older"]);
  });

  it("updates valid records and drops malformed persisted values", () => {
    const original = createLocalNote({ id: "note", title: "Idea", body: "One", now: 1 });
    expect(updateLocalNote({ note: original, title: "Plan", body: "Two", now: 2 })).toMatchObject({
      title: "Plan",
      body: "Two",
      updatedAt: 2,
    });
    expect(normalizeStoredNotes([original, { id: 1 }])).toEqual([original]);
  });
});
