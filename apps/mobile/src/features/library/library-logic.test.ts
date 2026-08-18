import type { MeetingSession, Note } from "@looper/data";
import { describe, expect, it } from "vitest";
import { buildLibraryItems } from "./library-logic";

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
});
